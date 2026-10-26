-- Social Boost → pestaña "Cuentas": qué ve el cliente.
-- Se pega una vez en Supabase → SQL Editor → Run.

-- Cada cuenta se puede ocultar del portal del cliente (en Roster siempre se ve)
ALTER TABLE sb_cuentas ADD COLUMN IF NOT EXISTS visible_cliente boolean NOT NULL DEFAULT true;

-- Ajustes generales de Roster (por ejemplo, si la pestaña "Cuentas" se muestra en el portal)
CREATE TABLE IF NOT EXISTS ajustes (
  clave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT 'null'::jsonb
);
