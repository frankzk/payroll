'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---- Subida de constancias (PDF / imágenes) ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const ALLOWED = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif']);
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) return cb(new Error('Tipo de archivo no permitido. Usa PDF o imagen.'));
    cb(null, true);
  },
});

// ---- Helpers ----
const MONEDAS = new Set(['PEN', 'USD']);
const JORNADAS = new Set(['completo', 'medio', 'horas']);
const MODALIDADES = new Set(['mensual', 'quincenal']);

function valorHora(t) {
  if (!t.horas_referencia || t.horas_referencia <= 0) return 0;
  return t.sueldo_mensual / t.horas_referencia;
}

// Base sugerida del periodo según la modalidad de pago.
function baseSugerida(sueldoMensual, modalidad) {
  return modalidad === 'quincenal' ? sueldoMensual / 2 : sueldoMensual;
}

function calcularTotal(pago) {
  return Number(pago.monto_base || 0) + Number(pago.horas_extra || 0) * Number(pago.valor_hora || 0);
}

function withTotal(pago) {
  return { ...pago, monto_extra: pago.horas_extra * pago.valor_hora, total: calcularTotal(pago) };
}

// ============================ TRABAJADORES ============================

app.get('/api/trabajadores', (req, res) => {
  const rows = db.prepare('SELECT * FROM trabajadores ORDER BY activo DESC, nombre').all();
  res.json(rows.map((t) => ({ ...t, valor_hora: valorHora(t) })));
});

app.post('/api/trabajadores', (req, res) => {
  const b = req.body || {};
  if (!b.nombre || !b.nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const tipo = JORNADAS.has(b.tipo_jornada) ? b.tipo_jornada : 'completo';
  const modalidad = MODALIDADES.has(b.modalidad_pago) ? b.modalidad_pago : 'mensual';
  const moneda = MONEDAS.has(b.moneda) ? b.moneda : 'PEN';
  const info = db
    .prepare(
      `INSERT INTO trabajadores (nombre, tipo_jornada, modalidad_pago, moneda, sueldo_mensual, horas_referencia, notas)
       VALUES (@nombre, @tipo_jornada, @modalidad_pago, @moneda, @sueldo_mensual, @horas_referencia, @notas)`
    )
    .run({
      nombre: b.nombre.trim(),
      tipo_jornada: tipo,
      modalidad_pago: modalidad,
      moneda,
      sueldo_mensual: Number(b.sueldo_mensual) || 0,
      horas_referencia: Number(b.horas_referencia) > 0 ? Number(b.horas_referencia) : 240,
      notas: (b.notas || '').trim(),
    });
  const row = db.prepare('SELECT * FROM trabajadores WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...row, valor_hora: valorHora(row) });
});

app.put('/api/trabajadores/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM trabajadores WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Trabajador no encontrado.' });
  const b = req.body || {};
  const merged = {
    nombre: (b.nombre ?? existing.nombre).trim(),
    tipo_jornada: JORNADAS.has(b.tipo_jornada) ? b.tipo_jornada : existing.tipo_jornada,
    modalidad_pago: MODALIDADES.has(b.modalidad_pago) ? b.modalidad_pago : existing.modalidad_pago,
    moneda: MONEDAS.has(b.moneda) ? b.moneda : existing.moneda,
    sueldo_mensual: b.sueldo_mensual !== undefined ? Number(b.sueldo_mensual) || 0 : existing.sueldo_mensual,
    horas_referencia:
      b.horas_referencia !== undefined && Number(b.horas_referencia) > 0
        ? Number(b.horas_referencia)
        : existing.horas_referencia,
    activo: b.activo !== undefined ? (b.activo ? 1 : 0) : existing.activo,
    notas: b.notas !== undefined ? (b.notas || '').trim() : existing.notas,
    id: existing.id,
  };
  db.prepare(
    `UPDATE trabajadores SET nombre=@nombre, tipo_jornada=@tipo_jornada, modalidad_pago=@modalidad_pago,
       moneda=@moneda, sueldo_mensual=@sueldo_mensual, horas_referencia=@horas_referencia, activo=@activo, notas=@notas
     WHERE id=@id`
  ).run(merged);
  const row = db.prepare('SELECT * FROM trabajadores WHERE id = ?').get(existing.id);
  res.json({ ...row, valor_hora: valorHora(row) });
});

app.delete('/api/trabajadores/:id', (req, res) => {
  const pagos = db.prepare('SELECT COUNT(*) AS n FROM pagos WHERE trabajador_id = ?').get(req.params.id);
  if (pagos.n > 0) {
    // No borramos historial de pagos: solo desactivamos.
    db.prepare('UPDATE trabajadores SET activo = 0 WHERE id = ?').run(req.params.id);
    return res.json({ ok: true, desactivado: true });
  }
  db.prepare('DELETE FROM trabajadores WHERE id = ?').run(req.params.id);
  res.json({ ok: true, eliminado: true });
});

// ============================ PAGOS ============================

app.get('/api/pagos', (req, res) => {
  const { estado, trabajador_id } = req.query;
  let sql =
    `SELECT p.*, t.nombre AS trabajador_nombre, t.tipo_jornada
     FROM pagos p JOIN trabajadores t ON t.id = p.trabajador_id`;
  const where = [];
  const params = {};
  if (estado && (estado === 'pendiente' || estado === 'pagado')) {
    where.push('p.estado = @estado');
    params.estado = estado;
  }
  if (trabajador_id) {
    where.push('p.trabajador_id = @trabajador_id');
    params.trabajador_id = trabajador_id;
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.created_at DESC, p.id DESC';
  const rows = db.prepare(sql).all(params);
  res.json(rows.map(withTotal));
});

app.get('/api/pagos/resumen', (req, res) => {
  // Resumen de lo pendiente y pagado, separado por moneda.
  const rows = db
    .prepare(
      `SELECT moneda, estado,
              SUM(monto_base + horas_extra * valor_hora) AS total,
              COUNT(*) AS cantidad
       FROM pagos GROUP BY moneda, estado`
    )
    .all();
  const resumen = {};
  for (const r of rows) {
    resumen[r.moneda] = resumen[r.moneda] || { pendiente: 0, pagado: 0, n_pendiente: 0, n_pagado: 0 };
    resumen[r.moneda][r.estado] = r.total;
    resumen[r.moneda][r.estado === 'pendiente' ? 'n_pendiente' : 'n_pagado'] = r.cantidad;
  }
  res.json(resumen);
});

app.post('/api/pagos', (req, res) => {
  const b = req.body || {};
  const t = db.prepare('SELECT * FROM trabajadores WHERE id = ?').get(b.trabajador_id);
  if (!t) return res.status(400).json({ error: 'Trabajador no válido.' });
  if (!b.periodo_label || !b.periodo_label.trim())
    return res.status(400).json({ error: 'Indica el periodo (ej. "Junio 2026").' });

  const periodo_tipo = MODALIDADES.has(b.periodo_tipo) ? b.periodo_tipo : t.modalidad_pago;
  const vh = b.valor_hora !== undefined && b.valor_hora !== '' ? Number(b.valor_hora) : valorHora(t);
  const monto_base =
    b.monto_base !== undefined && b.monto_base !== ''
      ? Number(b.monto_base)
      : baseSugerida(t.sueldo_mensual, periodo_tipo);

  const info = db
    .prepare(
      `INSERT INTO pagos (trabajador_id, periodo_label, periodo_tipo, moneda, monto_base, horas_extra, valor_hora, nota)
       VALUES (@trabajador_id, @periodo_label, @periodo_tipo, @moneda, @monto_base, @horas_extra, @valor_hora, @nota)`
    )
    .run({
      trabajador_id: t.id,
      periodo_label: b.periodo_label.trim(),
      periodo_tipo,
      moneda: MONEDAS.has(b.moneda) ? b.moneda : t.moneda,
      monto_base,
      horas_extra: Number(b.horas_extra) || 0,
      valor_hora: vh || 0,
      nota: (b.nota || '').trim(),
    });
  const row = db.prepare('SELECT * FROM pagos WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(withTotal(row));
});

app.put('/api/pagos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
  const b = req.body || {};
  const merged = {
    periodo_label: b.periodo_label !== undefined ? (b.periodo_label || '').trim() : existing.periodo_label,
    periodo_tipo: MODALIDADES.has(b.periodo_tipo) ? b.periodo_tipo : existing.periodo_tipo,
    moneda: MONEDAS.has(b.moneda) ? b.moneda : existing.moneda,
    monto_base: b.monto_base !== undefined ? Number(b.monto_base) || 0 : existing.monto_base,
    horas_extra: b.horas_extra !== undefined ? Number(b.horas_extra) || 0 : existing.horas_extra,
    valor_hora: b.valor_hora !== undefined ? Number(b.valor_hora) || 0 : existing.valor_hora,
    nota: b.nota !== undefined ? (b.nota || '').trim() : existing.nota,
    id: existing.id,
  };
  db.prepare(
    `UPDATE pagos SET periodo_label=@periodo_label, periodo_tipo=@periodo_tipo, moneda=@moneda,
       monto_base=@monto_base, horas_extra=@horas_extra, valor_hora=@valor_hora, nota=@nota
     WHERE id=@id`
  ).run(merged);
  const row = db.prepare('SELECT * FROM pagos WHERE id = ?').get(existing.id);
  res.json(withTotal(row));
});

// Marcar como pagado subiendo la constancia (obligatoria).
app.post('/api/pagos/:id/pagar', upload.single('constancia'), (req, res) => {
  const existing = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!existing) {
    if (req.file) fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
    return res.status(404).json({ error: 'Pago no encontrado.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Debes subir la constancia de pago (PDF o imagen).' });

  // Si ya tenía una constancia, la reemplazamos y borramos la anterior.
  if (existing.constancia_path) {
    fs.unlink(path.join(UPLOAD_DIR, existing.constancia_path), () => {});
  }

  const fecha_pago = req.body.fecha_pago || new Date().toISOString().slice(0, 10);
  db.prepare(
    `UPDATE pagos SET estado='pagado', fecha_pago=@fecha_pago, constancia_path=@cpath, constancia_nombre=@cnombre WHERE id=@id`
  ).run({
    fecha_pago,
    cpath: req.file.filename,
    cnombre: req.file.originalname,
    id: existing.id,
  });
  const row = db.prepare('SELECT * FROM pagos WHERE id = ?').get(existing.id);
  res.json(withTotal(row));
});

// Revertir a pendiente (quita la constancia).
app.post('/api/pagos/:id/revertir', (req, res) => {
  const existing = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
  if (existing.constancia_path) fs.unlink(path.join(UPLOAD_DIR, existing.constancia_path), () => {});
  db.prepare(
    `UPDATE pagos SET estado='pendiente', fecha_pago=NULL, constancia_path=NULL, constancia_nombre=NULL WHERE id=?`
  ).run(existing.id);
  const row = db.prepare('SELECT * FROM pagos WHERE id = ?').get(existing.id);
  res.json(withTotal(row));
});

app.delete('/api/pagos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pagos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Pago no encontrado.' });
  if (existing.constancia_path) fs.unlink(path.join(UPLOAD_DIR, existing.constancia_path), () => {});
  db.prepare('DELETE FROM pagos WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

// Manejo de errores de multer / subida.
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Error al procesar la solicitud.' });
  next();
});

app.listen(PORT, () => {
  console.log(`Planillas corriendo en http://localhost:${PORT}`);
});
