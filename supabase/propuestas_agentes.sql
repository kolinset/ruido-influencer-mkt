-- Ejecutar en Supabase → SQL Editor ANTES de publicar el conector de agentes.
--
-- Bandeja de propuestas del agente de Influencers. El agente nunca cambia nada
-- directo: deja aquí la propuesta (crear campaña, agregar influencers, cargar
-- links, actualizar un influencer, cambiar el estado) y se aplica cuando
-- alguien del equipo la aprueba en el Dashboard (api/propuestas.js).
-- Se puede correr más de una vez sin problema.

CREATE TABLE IF NOT EXISTS propuestas_agentes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  agente       text NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('crear_campana', 'lista_influencers', 'actualizar_influencer', 'agregar_links', 'cambiar_estado')),
  campaign_id  uuid REFERENCES campaigns(id) ON DELETE CASCADE, -- vacío en "crear_campana" hasta aprobarla
  resumen      text NOT NULL,
  motivo       text,
  datos        jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado       text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  resuelta_por text,
  resuelta_el  timestamptz
);

CREATE INDEX IF NOT EXISTS propuestas_agentes_estado_idx ON propuestas_agentes (estado, created_at DESC);

-- La app y el conector entran por el servidor (conexión directa), igual que el resto
-- de las tablas de ROSTER; se activa RLS sin políticas para que nadie la lea con la
-- clave pública del navegador.
ALTER TABLE propuestas_agentes ENABLE ROW LEVEL SECURITY;
