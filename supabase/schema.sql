-- Esquema de la base de datos para Supabase (Postgres).
-- La app crea estas tablas automáticamente en el primer arranque,
-- pero puedes ejecutarlo a mano en Supabase → SQL Editor si lo prefieres.

CREATE TABLE IF NOT EXISTS trabajadores (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre           text NOT NULL,
  tipo_jornada     text NOT NULL DEFAULT 'completo',   -- completo | medio | horas
  modalidad_pago   text NOT NULL DEFAULT 'mensual',    -- mensual | quincenal
  moneda           text NOT NULL DEFAULT 'PEN',        -- PEN | USD
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
  estado            text NOT NULL DEFAULT 'pendiente',  -- pendiente | pagado
  fecha_pago        date,
  constancia_path   text,
  constancia_nombre text,
  nota              text DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_trabajador ON pagos(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado);
