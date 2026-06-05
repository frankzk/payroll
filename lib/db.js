'use strict';

const { Pool, types } = require('pg');

// Postgres devuelve numeric/bigint como string. Los convertimos a número
// para que el cálculo y el frontend funcionen igual que antes.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8 / bigint

if (!process.env.DATABASE_URL) {
  console.warn('[db] Falta DATABASE_URL. Configúrala (cadena de conexión de Supabase Postgres).');
}

// En Supabase usa la cadena del "Connection Pooler" (Transaction mode, puerto 6543)
// para que funcione bien en serverless. SSL requerido.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_MAX || 3),
  idleTimeoutMillis: 10_000,
});

async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS trabajadores (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           text NOT NULL,
    tipo_jornada     text NOT NULL DEFAULT 'completo',
    modalidad_pago   text NOT NULL DEFAULT 'mensual',
    moneda           text NOT NULL DEFAULT 'PEN',
    sueldo_mensual   numeric NOT NULL DEFAULT 0,
    horas_referencia numeric NOT NULL DEFAULT 240,
    activo           boolean NOT NULL DEFAULT true,
    notas            text DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trabajador_id     bigint NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
    periodo_label     text NOT NULL,
    periodo_tipo      text NOT NULL DEFAULT 'mensual',
    moneda            text NOT NULL DEFAULT 'PEN',
    monto_base        numeric NOT NULL DEFAULT 0,
    horas_extra       numeric NOT NULL DEFAULT 0,
    valor_hora        numeric NOT NULL DEFAULT 0,
    estado            text NOT NULL DEFAULT 'pendiente',
    fecha_pago        date,
    constancia_path   text,
    constancia_nombre text,
    nota              text DEFAULT '',
    created_at        timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_pagos_trabajador ON pagos(trabajador_id);
  CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);
`;

// Crea las tablas si no existen (memoizado: solo una vez por proceso).
let schemaPromise = null;
function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(SCHEMA_SQL).catch((e) => {
      schemaPromise = null; // permite reintentar en la próxima petición
      throw e;
    });
  }
  return schemaPromise;
}

module.exports = { pool, q, one, ensureSchema, SCHEMA_SQL };
