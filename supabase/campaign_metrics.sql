-- Métricas leídas del reporte público de Tokchart (se actualizan solas cada 30 minutos cuando alguien abre la campaña).
-- Se pega una vez en Supabase → SQL Editor → Run.

CREATE TABLE IF NOT EXISTS campaign_metrics (
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  plataforma   text NOT NULL CHECK (plataforma IN ('tiktok', 'instagram')),
  views        bigint,
  likes        bigint,
  comments     bigint,
  saves        bigint,
  shares       bigint,
  engagement   numeric,
  posts        jsonb NOT NULL DEFAULT '[]'::jsonb, -- detalle por video
  fetched_at   timestamptz,                        -- última lectura correcta
  intento_at   timestamptz,                        -- último intento (aunque falle)
  error        text NOT NULL DEFAULT '',
  PRIMARY KEY (campaign_id, plataforma)
);
