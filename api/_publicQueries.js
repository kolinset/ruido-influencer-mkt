// Consultas que se pueden hacer SIN sesión iniciada (el "_" al inicio evita que Vercel lo exponga como ruta).
// Las usan las páginas públicas: propuesta del cliente (?token=), reporte (?report=),
// portal del cliente (?clientDashboard=) y su vista de Social Boost.
// El navegador solo manda el nombre y los valores; el texto SQL vive únicamente aquí,
// así nadie sin login puede ejecutar consultas propias contra la base.

export const PUBLIC_QUERIES = {
  // ───── Propuesta del cliente (VistaCliente) ─────
  campanaPorShareToken: `
    SELECT
      id, nombre AS camp_nombre, cliente, plataforma,
      reporte_url_tt, reporte_url_ig,
      tipo, contenidos_count, views_logradas, views_min, views_max,
      artista, cancion, budget_total, utilizable_pct,
      solicitado_por, es_legacy, moneda
    FROM campaigns
    WHERE share_token = $1 AND share_active = true
    LIMIT 1`,

  campanaShareTokenExiste: `SELECT id FROM campaigns WHERE share_token = $1`,

  influencersPorShareToken: `
    SELECT
      c.nombre AS camp_nombre, c.cliente, c.plataforma,
      c.reporte_url_tt, c.reporte_url_ig,
      c.tipo, c.contenidos_count, c.views_logradas,
      c.artista, c.cancion,
      c.budget_total, c.es_legacy, c.solicitado_por, c.moneda,
      i.nombre,
      i.ig_usuario, i.ig_seguidores, i.ig_link,
      i.tt_usuario, i.tt_seguidores, i.tt_link,
      i.tipos_contenido,
      ci.video_link_tt, ci.video_link_ig,
      ci.boostcode
    FROM campaigns c
    JOIN campaign_influencers ci ON ci.campaign_id = c.id
    JOIN influencers i ON i.id = ci.influencer_id
    WHERE c.share_token = $1 AND c.share_active = true`,

  // Propuesta y portal del cliente
  playlistsDeCampana: `
    SELECT nombre, link FROM campaign_playlists
    WHERE campaign_id = $1
    ORDER BY created_at ASC`,

  // ───── Reporte (VistaReporte) ─────
  reportePorToken: `
    SELECT rt.*, c.nombre AS camp_nombre, c.cliente, c.plataforma
    FROM report_tokens rt
    JOIN campaigns c ON c.id = rt.campaign_id
    WHERE rt.token = $1 AND rt.activo = true
    LIMIT 1`,

  reporteTokenExiste: `SELECT id FROM report_tokens WHERE token = $1`,

  postsDeReporte: `
    SELECT
      p.*,
      i.nombre AS inf_nombre,
      i.ig_usuario, i.tt_usuario,
      i.ig_seguidores, i.tt_seguidores,
      i.tipos_contenido,
      pm.id AS pm_id,
      pm.views, pm.likes, pm.comentarios,
      pm.shares, pm.saves, pm.engagement_rate,
      pm.fecha_registro, pm.fuente
    FROM posts p
    JOIN influencers i ON i.id = p.influencer_id
    LEFT JOIN post_metrics pm ON pm.post_id = p.id
    WHERE p.campaign_id = $1
    ORDER BY p.fecha_publicacion DESC NULLS LAST`,

  // ───── Portal del cliente (VistaClienteDashboard) ─────
  portalPorToken: `
    SELECT ct.*, c.nombre AS client_nombre, c.color, c.slug, c.social_boost_activo
    FROM client_tokens ct
    JOIN clients c ON c.id = ct.client_id
    WHERE ct.token = $1 AND ct.activo = true
    LIMIT 1`,

  portalTokenExiste: `SELECT id FROM client_tokens WHERE token = $1`,

  campanasDelPortal: `
    SELECT
      c.id, c.nombre, c.artista, c.cancion, c.estado,
      c.fecha_inicio, c.fecha_termino, c.plataforma,
      c.reporte_url_tt, c.reporte_url_ig,
      c.tipo, c.contenidos_count, c.views_logradas, c.views_min, c.views_max,
      c.budget_total, c.utilizable_pct, c.solicitado_por, c.es_legacy, c.moneda,
      c.created_at,
      COUNT(DISTINCT ci.id) AS total_influencers,
      COUNT(DISTINCT CASE WHEN ci.video_link_tt != '' OR ci.video_link_ig != '' THEN ci.id END) AS videos_publicados,
      COUNT(DISTINCT cp.id) AS total_playlists
    FROM campaigns c
    LEFT JOIN campaign_influencers ci ON ci.campaign_id = c.id
    LEFT JOIN campaign_playlists cp ON cp.campaign_id = c.id
    WHERE c.client_id = $1
    GROUP BY c.id
    ORDER BY c.created_at DESC`,

  influencersDeCampanaPortal: `
    SELECT
      i.nombre, i.ig_usuario, i.ig_seguidores, i.ig_link,
      i.tt_usuario, i.tt_seguidores, i.tt_link,
      i.tipos_contenido,
      ci.video_link_tt, ci.video_link_ig, ci.boostcode
    FROM campaign_influencers ci
    JOIN influencers i ON i.id = ci.influencer_id
    WHERE ci.campaign_id = $1
    ORDER BY
      CASE WHEN $2 = 'Instagram' THEN i.ig_seguidores ELSE i.tt_seguidores END DESC`,

  // ───── Links de videos de Clipping / Nano Blast ─────
  linksPorShareToken: `
    SELECT l.url, l.link_original, l.handle
    FROM campaign_links l
    JOIN campaigns c ON c.id = l.campaign_id
    WHERE c.share_token = $1 AND c.share_active = true
    ORDER BY l.posicion, l.created_at`,

  linksDeCampana: `
    SELECT url, link_original, handle FROM campaign_links
    WHERE campaign_id = $1
    ORDER BY posicion, created_at`,

  // ───── Social Boost en el portal del cliente (VistaSocialBoost) ─────
  sbSemana: `SELECT id, sin_prioridad FROM sb_semanas WHERE inicio = $1`,

  sbSlotsDeSemana: `
    SELECT ss.slot, ss.prioridad, ss.objetivo, c.id AS cancion_id, c.cancion, c.artista, c.tokchart_url, c.solicitante,
      (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id AND v.semana_id = ss.semana_id)::int AS vids_sem,
      (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id)::int AS vids_mes
    FROM sb_semana_slots ss JOIN sb_canciones c ON c.id = ss.cancion_id
    WHERE ss.semana_id = $1 ORDER BY ss.slot`,

  sbVideosDelMes: `SELECT count(*)::int AS n FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id WHERE c.mes = $1`,

  sbVideosDeSemana: `SELECT count(*)::int AS n FROM sb_videos WHERE semana_id = $1`,

  sbRepartoDelMes: `
    SELECT cu.id, cu.nombre, count(*)::int AS n
    FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id
    LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
    WHERE c.mes = $1 GROUP BY cu.id, cu.nombre ORDER BY n DESC`,

  // ¿La pestaña "Cuentas" de Social Boost está visible en el portal?
  sbCuentasPortal: `SELECT valor FROM ajustes WHERE clave = 'sb_cuentas_portal'`,

  sbVideosDeCancion: `
    SELECT v.id, v.link_web, v.link_original, v.handle, s.inicio::text AS semana_inicio, cu.nombre AS cuenta_nombre
    FROM sb_videos v LEFT JOIN sb_semanas s ON s.id = v.semana_id
    LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
    WHERE v.cancion_id = $1 ORDER BY v.created_at DESC, v.id`,
}
