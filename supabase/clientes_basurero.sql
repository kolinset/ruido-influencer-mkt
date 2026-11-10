-- Basurero de clientes: un cliente eliminado guarda aquí la fecha en que se eliminó.
-- Mientras tenga fecha no aparece en Roster ni en los agentes, y su portal deja de funcionar.
-- A los 7 días el envío diario (api/resumen-diario.js) lo borra por completo.
-- Se puede correr más de una vez sin problema.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS eliminado_at timestamptz;
