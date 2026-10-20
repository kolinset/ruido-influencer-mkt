-- Métricas de las canciones de Social Boost, leídas de su reporte de Tokchart
-- (se actualizan solas cada 30 minutos cuando alguien abre la canción).
-- Se pega una vez en Supabase → SQL Editor → Run.

CREATE TABLE IF NOT EXISTS sb_metricas (
  cancion_id   uuid NOT NULL REFERENCES sb_canciones(id) ON DELETE CASCADE,
  plataforma   text NOT NULL CHECK (plataforma IN ('tiktok', 'instagram')),
  views        bigint,
  likes        bigint,
  comments     bigint,
  saves        bigint,
  shares       bigint,
  engagement   numeric,
  posts        jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at   timestamptz,
  intento_at   timestamptz,
  error        text NOT NULL DEFAULT '',
  PRIMARY KEY (cancion_id, plataforma)
);
