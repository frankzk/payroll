'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'payroll.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS trabajadores (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT    NOT NULL,
    tipo_jornada    TEXT    NOT NULL DEFAULT 'completo',   -- completo | medio | horas
    modalidad_pago  TEXT    NOT NULL DEFAULT 'mensual',    -- mensual | quincenal (por defecto; se puede cambiar en cada pago)
    moneda          TEXT    NOT NULL DEFAULT 'PEN',        -- PEN | USD
    sueldo_mensual  REAL    NOT NULL DEFAULT 0,
    horas_referencia REAL   NOT NULL DEFAULT 240,          -- horas/mes para calcular el valor hora
    activo          INTEGER NOT NULL DEFAULT 1,
    notas           TEXT    DEFAULT '',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trabajador_id   INTEGER NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    periodo_label   TEXT    NOT NULL,                      -- ej "Junio 2026" o "1ra quincena Junio 2026"
    periodo_tipo    TEXT    NOT NULL DEFAULT 'mensual',    -- mensual | quincenal
    moneda          TEXT    NOT NULL DEFAULT 'PEN',
    monto_base      REAL    NOT NULL DEFAULT 0,            -- base del periodo (editable)
    horas_extra     REAL    NOT NULL DEFAULT 0,
    valor_hora      REAL    NOT NULL DEFAULT 0,            -- snapshot del valor hora al crear el pago
    estado          TEXT    NOT NULL DEFAULT 'pendiente',  -- pendiente | pagado
    fecha_pago      TEXT,
    constancia_path TEXT,
    constancia_nombre TEXT,
    nota            TEXT    DEFAULT '',
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pagos_trabajador ON pagos(trabajador_id);
  CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);
`);

module.exports = db;
