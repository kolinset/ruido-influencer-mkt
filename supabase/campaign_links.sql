-- Links de videos de las campañas de Clipping y Nano Blast (solo TikTok).
-- Se pega una vez en Supabase → SQL Editor → Run.

CREATE TABLE IF NOT EXISTS campaign_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  link_original text NOT NULL,              -- tal como se pegó
  url           text NOT NULL DEFAULT '',   -- link de escritorio (tiktok.com/@usuario/video/ID); vacío si no se pudo convertir
  handle        text NOT NULL DEFAULT '',   -- usuario sacado del link, sin @
  video_id      text NOT NULL DEFAULT '',
  posicion      integer NOT NULL DEFAULT 0, -- orden de la lista pegada
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, link_original)
);

CREATE INDEX IF NOT EXISTS campaign_links_campaign_idx ON campaign_links (campaign_id, posicion);
