'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const { q, one, ensureSchema } = require('./db');
const storage = require('./storage');

const app = express();

app.use(express.json());
// Estático para desarrollo local (en Vercel lo sirve la plataforma desde /public).
app.use(express.static(path.join(__dirname, '..', 'public')));

// Diagnóstico: indica si la DB y el storage están configurados (no toca la DB).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: !!process.env.DATABASE_URL, storage: storage.configured() });
});

// Asegura que las tablas existan antes de atender peticiones de API.
app.use('/api', async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (e) {
    res.status(500).json({ error: 'No se pudo conectar a la base de datos: ' + e.message });
  }
});

// ---- Subida de constancias en memoria (luego van a Supabase Storage) ----
const ALLOWED = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('Tipo de archivo no permitido. Usa PDF o imagen.'));
    cb(null, true);
  },
});

// ---- Helpers de cálculo ----
const MONEDAS = new Set(['PEN', 'USD']);
const JORNADAS = new Set(['completo', 'medio', 'horas']);
const MODALIDADES = new Set(['mensual', 'quincenal']);

function valorHora(t) {
  if (!t.horas_referencia || t.horas_referencia <= 0) return 0;
  return t.sueldo_mensual / t.horas_referencia;
}
function baseSugerida(sueldoMensual, modalidad) {
  return modalidad === 'quincenal' ? sueldoMensual / 2 : sueldoMensual;
}
function calcularTotal(p) {
  return Number(p.monto_base || 0) + Number(p.horas_extra || 0) * Number(p.valor_hora || 0);
}
function withTotal(p) {
  return { ...p, monto_extra: p.horas_extra * p.valor_hora, total: calcularTotal(p) };
}

// Envuelve handlers async y centraliza el manejo de errores.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ============================ TRABAJADORES ============================
app.get(
  '/api/trabajadores',
  wrap(async (req, res) => {
    const rows = await q('SELECT * FROM trabajadores ORDER BY activo DESC, nombre');
    res.json(rows.map((t) => ({ ...t, valor_hora: valorHora(t) })));
  })
);

app.post(
  '/api/trabajadores',
  wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.nombre || !b.nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    const row = await one(
      `INSERT INTO trabajadores (nombre, tipo_jornada, modalidad_pago, moneda, sueldo_mensual, horas_referencia, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        b.nombre.trim(),
        JORNADAS.has(b.tipo_jornada) ? b.tipo_jornada : 'completo',
        MODALIDADES.has(b.modalidad_pago) ? b.modalidad_pago : 'mensual',
        MONEDAS.has(b.moneda) ? b.moneda : 'PEN',
        Number(b.sueldo_mensual) || 0,
        Number(b.horas_referencia) > 0 ? Number(b.horas_referencia) : 240,
        (b.notas || '').trim(),
      ]
    );
    res.status(201).json({ ...row, valor_hora: valorHora(row) });
  })
);

app.put(
  '/api/trabajadores/:id',
  wrap(async (req, res) => {
    const existing = await one('SELECT * FROM trabajadores WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Trabajador no encontrado.' });
    const b = req.body || {};
    const row = await one(
      `UPDATE trabajadores SET nombre=$1, tipo_jornada=$2, modalidad_pago=$3, moneda=$4,
         sueldo_mensual=$5, horas_referencia=$6, activo=$7, notas=$8 WHERE id=$9 RETURNING *`,
      [
        (b.nombre ?? existing.nombre).trim(),
        JORNADAS.has(b.tipo_jornada) ? b.tipo_jornada : existing.tipo_jornada,
        MODALIDADES.has(b.modalidad_pago) ? b.modalidad_pago : existing.modalidad_pago,
        MONEDAS.has(b.moneda) ? b.moneda : existing.moneda,
        b.sueldo_mensual !== undefined ? Number(b.sueldo_mensual) || 0 : existing.sueldo_mensual,
        b.horas_referencia !== undefined && Number(b.horas_referencia) > 0
          ? Number(b.horas_referencia)
          : existing.horas_referencia,
        b.activo !== undefined ? !!b.activo : existing.activo,
        b.notas !== undefined ? (b.notas || '').trim() : existing.notas,
        existing.id,
      ]
    );
    res.json({ ...row, valor_hora: valorHora(row) });
  })
);

app.delete(
  '/api/trabajadores/:id',
  wrap(async (req, res) => {
    const { n } = await one('SELECT COUNT(*)::int AS n FROM pagos WHERE trabajador_id = $1', [req.params.id]);
    if (n > 0) {
      await q('UPDATE trabajadores SET activo = false WHERE id = $1', [req.params.id]);
      return res.json({ ok: true, desactivado: true });
    }
    await q('DELETE FROM trabajadores WHERE id = $1', [req.params.id]);
    res.json({ ok: true, eliminado: true });
  })
);

// ============================ PAGOS ============================
app.get(
  '/api/pagos',
  wrap(async (req, res) => {
    const { estado, trabajador_id } = req.query;
    let sql = `SELECT p.*, t.nombre AS trabajador_nombre, t.tipo_jornada
               FROM pagos p JOIN trabajadores t ON t.id = p.trabajador_id`;
    const where = [];
    const params = [];
    if (estado === 'pendiente' || estado === 'pagado') {
      params.push(estado);
      where.push(`p.estado = $${params.length}`);
    }
    if (trabajador_id) {
      params.push(trabajador_id);
      where.push(`p.trabajador_id = $${params.length}`);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY p.created_at DESC, p.id DESC';
    const rows = await q(sql, params);
    res.json(rows.map(withTotal));
  })
);

app.get(
  '/api/pagos/resumen',
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT moneda, estado, SUM(monto_base + horas_extra * valor_hora) AS total, COUNT(*)::int AS cantidad
       FROM pagos GROUP BY moneda, estado`
    );
    const resumen = {};
    for (const r of rows) {
      resumen[r.moneda] = resumen[r.moneda] || { pendiente: 0, pagado: 0, n_pendiente: 0, n_pagado: 0 };
      resumen[r.moneda][r.estado] = Number(r.total) || 0;
      resumen[r.moneda][r.estado === 'pendiente' ? 'n_pendiente' : 'n_pagado'] = r.cantidad;
    }
    res.json(resumen);
  })
);

app.post(
  '/api/pagos',
  wrap(async (req, res) => {
    const b = req.body || {};
    const t = await one('SELECT * FROM trabajadores WHERE id = $1', [b.trabajador_id]);
    if (!t) return res.status(400).json({ error: 'Trabajador no válido.' });
    if (!b.periodo_label || !b.periodo_label.trim())
      return res.status(400).json({ error: 'Indica el periodo (ej. "Junio 2026").' });

    const periodo_tipo = MODALIDADES.has(b.periodo_tipo) ? b.periodo_tipo : t.modalidad_pago;
    const vh = b.valor_hora !== undefined && b.valor_hora !== '' ? Number(b.valor_hora) : valorHora(t);
    const monto_base =
      b.monto_base !== undefined && b.monto_base !== ''
        ? Number(b.monto_base)
        : baseSugerida(t.sueldo_mensual, periodo_tipo);

    const row = await one(
      `INSERT INTO pagos (trabajador_id, periodo_label, periodo_tipo, moneda, monto_base, horas_extra, valor_hora, nota)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        t.id,
        b.periodo_label.trim(),
        periodo_tipo,
        MONEDAS.has(b.moneda) ? b.moneda : t.moneda,
        monto_base,
        Number(b.horas_extra) || 0,
        vh || 0,
        (b.nota || '').trim(),
      ]
    );
    res.status(201).json(withTotal(row));
  })
);

app.put(
  '/api/pagos/:id',
  wrap(async (req, res) => {
    const existing = await one('SELECT * FROM pagos WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
    const b = req.body || {};
    const row = await one(
      `UPDATE pagos SET periodo_label=$1, periodo_tipo=$2, moneda=$3, monto_base=$4,
         horas_extra=$5, valor_hora=$6, nota=$7 WHERE id=$8 RETURNING *`,
      [
        b.periodo_label !== undefined ? (b.periodo_label || '').trim() : existing.periodo_label,
        MODALIDADES.has(b.periodo_tipo) ? b.periodo_tipo : existing.periodo_tipo,
        MONEDAS.has(b.moneda) ? b.moneda : existing.moneda,
        b.monto_base !== undefined ? Number(b.monto_base) || 0 : existing.monto_base,
        b.horas_extra !== undefined ? Number(b.horas_extra) || 0 : existing.horas_extra,
        b.valor_hora !== undefined ? Number(b.valor_hora) || 0 : existing.valor_hora,
        b.nota !== undefined ? (b.nota || '').trim() : existing.nota,
        existing.id,
      ]
    );
    res.json(withTotal(row));
  })
);

// Marcar como pagado subiendo la constancia (obligatoria) a Supabase Storage.
app.post(
  '/api/pagos/:id/pagar',
  upload.single('constancia'),
  wrap(async (req, res) => {
    const existing = await one('SELECT * FROM pagos WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
    if (!req.file) return res.status(400).json({ error: 'Debes subir la constancia de pago (PDF o imagen).' });

    const objectPath = await storage.uploadConstancia(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (existing.constancia_path) await storage.removeConstancia(existing.constancia_path); // reemplazo

    const fecha_pago = req.body.fecha_pago || new Date().toISOString().slice(0, 10);
    const row = await one(
      `UPDATE pagos SET estado='pagado', fecha_pago=$1, constancia_path=$2, constancia_nombre=$3 WHERE id=$4 RETURNING *`,
      [fecha_pago, objectPath, req.file.originalname, existing.id]
    );
    res.json(withTotal(row));
  })
);

// Redirige a una URL firmada temporal para ver la constancia (bucket privado).
app.get(
  '/api/pagos/:id/constancia',
  wrap(async (req, res) => {
    const p = await one('SELECT constancia_path FROM pagos WHERE id = $1', [req.params.id]);
    if (!p || !p.constancia_path) return res.status(404).send('Sin constancia.');
    res.redirect(await storage.signedUrl(p.constancia_path, 120));
  })
);

app.post(
  '/api/pagos/:id/revertir',
  wrap(async (req, res) => {
    const existing = await one('SELECT * FROM pagos WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
    if (existing.constancia_path) await storage.removeConstancia(existing.constancia_path);
    const row = await one(
      `UPDATE pagos SET estado='pendiente', fecha_pago=NULL, constancia_path=NULL, constancia_nombre=NULL
       WHERE id=$1 RETURNING *`,
      [existing.id]
    );
    res.json(withTotal(row));
  })
);

app.delete(
  '/api/pagos/:id',
  wrap(async (req, res) => {
    const existing = await one('SELECT * FROM pagos WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
    if (existing.constancia_path) await storage.removeConstancia(existing.constancia_path);
    await q('DELETE FROM pagos WHERE id = $1', [existing.id]);
    res.json({ ok: true });
  })
);

// Manejo central de errores (multer, validación, DB, etc.)
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Error al procesar la solicitud.' });
  next();
});

module.exports = app;
