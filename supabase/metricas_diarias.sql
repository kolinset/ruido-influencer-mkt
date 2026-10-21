-- Foto diaria de las views de cada campaña y canción (para "+X desde ayer" en el resumen por mail,
-- y para tener historia de cómo crecen). Se pega una vez en Supabase → SQL Editor → Run.

CREATE TABLE IF NOT EXISTS metricas_diarias (
  fecha   date   NOT NULL,
  tipo    text   NOT NULL CHECK (tipo IN ('campana', 'cancion')),
  ref_id  uuid   NOT NULL,
  views   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (fecha, tipo, ref_id)
);
