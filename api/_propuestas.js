// Aplica (o rechaza) una propuesta de un agente. Lo usa api/propuestas.js, que
// antes verifica que quien aprueba tenga sesión iniciada.
// Todo ocurre en una transacción: si algo falla, no queda nada a medias.
// Las escrituras son las mismas que hace la pantalla de Campañas.

import { randomUUID } from 'node:crypto'
import { hoyChile } from './_herramientasAgentes.js'

const parse = d => (typeof d === 'string' ? JSON.parse(d) : d) || {}

async function aplicar(q, p, hoy) {
  const d = parse(p.datos)
  const sync = new Set() // redes de Tokchart a sincronizar después (las hace el navegador, como hoy)

  if (p.tipo === 'crear_campana') {
    const dup = await q(`SELECT id FROM campaigns WHERE lower(nombre) = lower($1)`, [d.nombre])
    if (dup.rows.length) throw new Error(`Ya existe la campaña ${d.nombre}`)
    const estado = d.fecha_inicio && d.fecha_inicio > hoy ? 'Programada' : 'Activa'
    const r = await q(`INSERT INTO campaigns (nombre, cliente, client_id, budget, budget_total, moneda, brief, plataforma, share_token, artista, cancion, fecha_inicio, fecha_termino, reporte_url_tt, reporte_url_ig, tipo, contenidos_count, views_logradas, views_min, views_max, service_id, utilizable_pct, solicitado_por, es_legacy, estado)
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, $12, '', '', $13, 0, 0, $14, $15, $16, $17, $18, false, $19) RETURNING id`,
      [d.nombre, d.cliente, d.client_id, d.budget, d.moneda, d.brief || '', d.plataforma, randomUUID(), d.artista, d.cancion, d.fecha_inicio, d.fecha_termino, d.tipo, d.views_min || 0, d.views_max || 0, d.service_id, d.utilizable_pct, d.solicitado_por || '', estado])
    return { campaign_id: r.rows[0].id, mensaje: `Campaña creada (${estado})` }
  }

  const camp = (await q(`SELECT id, estado FROM campaigns WHERE id = $1`, [p.campaign_id])).rows[0]
  if (!camp) throw new Error('La campaña ya no existe')

  if (p.tipo === 'lista_influencers') {
    let n = 0
    for (const i of d.influencers || []) {
      const ya = await q(`SELECT 1 FROM campaign_influencers WHERE campaign_id = $1 AND influencer_id = $2`, [camp.id, i.influencer_id])
      if (ya.rows.length) continue
      await q(`INSERT INTO campaign_influencers (campaign_id, influencer_id, costo, piezas, estado, notas, video_link_tt, video_link_ig, boostcode, estado_pago, link_boleta)
        VALUES ($1, $2, 0, $3, 'Contactado', $4, '', '', '', 'Pendiente', '')`, [camp.id, i.influencer_id, i.piezas || 1, i.nota || ''])
      n++
    }
    return { mensaje: `${n} influencer(s) agregados` }
  }

  if (p.tipo === 'actualizar_influencer') {
    const ci = (await q(`SELECT * FROM campaign_influencers WHERE campaign_id = $1 AND influencer_id = $2`, [camp.id, d.influencer_id])).rows[0]
    if (!ci) throw new Error('El influencer ya no está en la campaña')
    const c = d.cambios || {}
    const notas = c.nota ? [ci.notas, c.nota].filter(Boolean).join('\n') : ci.notas
    await q(`UPDATE campaign_influencers SET estado = $2, costo = $3, piezas = $4, video_link_tt = $5, video_link_ig = $6, notas = $7 WHERE id = $1`,
      [ci.id, c.estado ?? ci.estado, c.costo ?? ci.costo, c.piezas ?? ci.piezas, c.video_link_tt ?? ci.video_link_tt, c.video_link_ig ?? ci.video_link_ig, notas])
    for (const [col, plat, red] of [['video_link_tt', 'TikTok', 'tiktok'], ['video_link_ig', 'Instagram', 'instagram']]) {
      if (!c[col] || c[col] === ci[col]) continue
      const ex = await q(`SELECT id FROM posts WHERE campaign_id = $1 AND influencer_id = $2 AND plataforma = $3 LIMIT 1`, [camp.id, d.influencer_id, plat])
      if (ex.rows.length) await q(`UPDATE posts SET url = $2 WHERE id = $1`, [ex.rows[0].id, c[col]])
      else await q(`INSERT INTO posts (campaign_id, influencer_id, plataforma, url) VALUES ($1, $2, $3, $4)`, [camp.id, d.influencer_id, plat, c[col]])
      sync.add(red)
    }
    return { mensaje: 'Influencer actualizado', sync: [...sync] }
  }

  if (p.tipo === 'agregar_links') {
    const base = Number((await q(`SELECT count(*) AS n FROM campaign_links WHERE campaign_id = $1`, [camp.id])).rows[0].n) || 0
    let k = 0
    for (const f of d.filas || []) {
      await q(`INSERT INTO campaign_links (campaign_id, link_original, url, handle, video_id, posicion) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (campaign_id, link_original) DO UPDATE SET url = EXCLUDED.url, handle = EXCLUDED.handle, video_id = EXCLUDED.video_id`,
        [camp.id, f.link_original, f.url || '', f.handle || '', f.video_id || '', base + k++])
    }
    await q(`UPDATE campaigns SET contenidos_count = (SELECT count(*) FROM campaign_links WHERE campaign_id = $1) WHERE id = $1`, [camp.id])
    return { mensaje: `${k} links cargados`, sync: ['tiktok'] }
  }

  if (p.tipo === 'cambiar_estado') {
    await q(`UPDATE campaigns SET estado = $2 WHERE id = $1`, [camp.id, d.estado])
    return { mensaje: `Estado: ${d.estado}` }
  }

  throw new Error(`Tipo de propuesta desconocido: ${p.tipo}`)
}

// client: una conexión (pool.connect()) o cualquier objeto con query(texto, parámetros).
export async function resolverPropuesta(client, { id, aprobar, email, hoy = hoyChile() }) {
  const q = (t, p) => client.query(t, p)
  await q('BEGIN')
  try {
    const p = (await q(`SELECT * FROM propuestas_agentes WHERE id::text = $1 FOR UPDATE`, [String(id)])).rows[0]
    if (!p) throw new Error('La propuesta no existe')
    if (p.estado !== 'pendiente') { await q('ROLLBACK'); return { ok: false, mensaje: `Esta propuesta ya estaba ${p.estado}` } }
    let r = { mensaje: 'Rechazada' }
    if (aprobar) r = await aplicar(q, p, hoy)
    await q(`UPDATE propuestas_agentes SET estado = $2, resuelta_por = $3, resuelta_el = now(), campaign_id = COALESCE($4, campaign_id) WHERE id = $1`,
      [p.id, aprobar ? 'aprobada' : 'rechazada', email || 'equipo', r.campaign_id || null])
    await q('COMMIT')
    return { ok: true, ...r, campaign_id: r.campaign_id || p.campaign_id }
  } catch (e) {
    await q('ROLLBACK').catch(() => {})
    throw e
  }
}
