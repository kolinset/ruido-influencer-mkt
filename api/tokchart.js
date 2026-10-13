import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { isValidTikTokUrl, isTikTokHost, expandTikTok } from './_tiktok.js'

// Conecta ROSTER con la API de Tokchart. El token vive solo en el servidor
// (variable TOKCHART_API_TOKEN en Vercel) y solo pueden usarlo usuarios con login.

const TOKCHART = 'https://tokchart.com/api/v1'
const TT_REPORT_BASE = 'https://tokchart.com/campaigns/'
const IG_REPORT_BASE = 'https://tokchart.com/campaigns/instagram/'
const CHUNK = 50
const MAX_CONVERTIR = 16 // links cortos que se convierten por pulsación (para no pasar el tiempo límite)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })

async function tokchart(path, body) {
  const r = await fetch(TOKCHART + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TOKCHART_API_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    const detalle = json.errors ? ' ' + JSON.stringify(json.errors) : ''
    throw Object.assign(new Error((json.message || `Tokchart respondió ${r.status}`) + detalle), { status: r.status })
  }
  return json
}

const esMovilTT = u => isTikTokHost(u) && (/^https?:\/\/(vt|vm|m)\.tiktok\.com\//i.test(u) || /^https?:\/\/(www\.)?tiktok\.com\/t\//i.test(u))

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const esReelIG = u => /^https?:\/\/(www\.)?instagram\.com\/(reel|reels)\//i.test(u)

// Links de influencers de la campaña, válidos para enviar y todavía no enviados.
// En TikTok, los links cortos (vt.tiktok.com...) se convierten aquí mismo y se corrige el link guardado.
async function linksPendientes(campaignId, plat) {
  const col = plat === 'tiktok' ? 'video_link_tt' : 'video_link_ig'
  const rows = (await pool.query(`SELECT id, influencer_id, ${col} AS url FROM campaign_influencers WHERE campaign_id = $1 AND ${col} <> ''`, [campaignId])).rows
  const enviados = new Set((await pool.query('SELECT url FROM tokchart_links WHERE campaign_id = $1 AND plataforma = $2', [campaignId, plat])).rows.map(r => r.url))
  const validos = [], omitidos = []
  const porConvertir = []
  for (const row of rows) {
    const u = (row.url || '').trim()
    if (!u) continue
    if (plat === 'tiktok' && !isValidTikTokUrl(u) && esMovilTT(u)) { porConvertir.push({ ...row, url: u }); continue }
    const ok = plat === 'tiktok' ? isValidTikTokUrl(u) : esReelIG(u)
    if (!ok) { omitidos.push(u); continue }
    if (!enviados.has(u) && !validos.includes(u)) validos.push(u)
  }

  let convertidos = 0, faltanConvertir = 0
  if (porConvertir.length) {
    const lote = porConvertir.slice(0, MAX_CONVERTIR)
    faltanConvertir = porConvertir.length - lote.length
    omitidos.push(...porConvertir.slice(MAX_CONVERTIR).map(r => r.url))
    const res = await mapLimit(lote, 4, async (r) => {
      try { return { r, nuevo: await expandTikTok(r.url) } } catch { return { r, nuevo: null } }
    })
    for (const { r, nuevo } of res) {
      if (!nuevo || !isValidTikTokUrl(nuevo)) { omitidos.push(r.url); continue }
      await pool.query('UPDATE campaign_influencers SET video_link_tt = $1 WHERE id = $2 AND video_link_tt = $3', [nuevo, r.id, r.url])
      await pool.query("UPDATE posts SET url = $1 WHERE campaign_id = $2 AND influencer_id = $3 AND plataforma = 'TikTok' AND url = $4", [nuevo, campaignId, r.influencer_id, r.url])
      convertidos++
      if (!enviados.has(nuevo) && !validos.includes(nuevo)) validos.push(nuevo)
    }
  }
  return { validos, omitidos, convertidos, faltanConvertir }
}

async function marcarEnviados(campaignId, plat, urls) {
  for (const u of urls) {
    await pool.query('INSERT INTO tokchart_links (campaign_id, plataforma, url) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [campaignId, plat, u])
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const token = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No autorizado. Iniciá sesión de nuevo.' })
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return res.status(401).json({ error: 'Sesión inválida o expirada.' })

  if (!process.env.TOKCHART_API_TOKEN) return res.status(500).json({ error: 'Falta configurar TOKCHART_API_TOKEN en Vercel.' })

  const { action, campaign_id, plataforma, sobrescribir } = req.body || {}
  if (!UUID_RE.test(campaign_id || '')) return res.status(400).json({ error: 'Campaña inválida' })
  if (plataforma !== 'tiktok' && plataforma !== 'instagram') return res.status(400).json({ error: 'Plataforma inválida' })
  const tt = plataforma === 'tiktok'

  try {
    const camp = (await pool.query(`
      SELECT c.id, c.nombre, c.artista, c.cancion, c.tipo, c.fecha_inicio::text AS fi, c.fecha_termino::text AS ft,
             c.tokchart_tt_uuid, c.tokchart_ig_uuid, c.reporte_url_tt, c.reporte_url_ig, s.nombre AS servicio
      FROM campaigns c LEFT JOIN services s ON s.id = c.service_id WHERE c.id = $1`, [campaign_id])).rows[0]
    if (!camp) return res.status(404).json({ error: 'Campaña no encontrada' })
    const uuidActual = tt ? camp.tokchart_tt_uuid : camp.tokchart_ig_uuid
    const conLinks = camp.tipo !== 'Clipping' && camp.tipo !== 'Nano Blast' && camp.tipo !== 'Playlisting'

    // ───── Crear el reporte (siempre por botón) ─────
    if (action === 'create') {
      if (uuidActual) return res.status(409).json({ error: 'ya_existe', message: 'Esta campaña ya tiene un reporte en Tokchart.' })
      const urlActual = tt ? camp.reporte_url_tt : camp.reporte_url_ig
      if (urlActual && !sobrescribir) return res.status(409).json({ error: 'ya_tiene_link', actual: urlActual })

      const nombre = [camp.servicio || camp.tipo, camp.artista, camp.cancion].filter(Boolean).join(' - ') || camp.nombre
      const body = { name: nombre.slice(0, 255) }
      if (camp.fi) body.start_date = camp.fi
      if (camp.ft) body.end_date = camp.ft
      let validos = [], omitidos = [], convertidos = 0, faltanConvertir = 0
      if (conLinks) {
        ({ validos, omitidos, convertidos, faltanConvertir } = await linksPendientes(camp.id, plataforma))
        if (validos.length) body.links = validos
      }

      const r = await tokchart(`/campaigns/${tt ? 'tiktok' : 'instagram'}`, body)
      const uuid = r.uuid
      if (!uuid) throw new Error('Tokchart no devolvió el identificador del reporte.')
      const base = tt ? TT_REPORT_BASE : IG_REPORT_BASE
      const url = base ? base + uuid : null

      if (tt) await pool.query('UPDATE campaigns SET tokchart_tt_uuid = $1, reporte_url_tt = COALESCE($2, reporte_url_tt) WHERE id = $3', [uuid, url, camp.id])
      else await pool.query('UPDATE campaigns SET tokchart_ig_uuid = $1, reporte_url_ig = COALESCE($2, reporte_url_ig) WHERE id = $3', [uuid, url, camp.id])
      if (validos.length && r.links_added === validos.length) await marcarEnviados(camp.id, plataforma, validos)

      return res.status(200).json({ uuid, url, nombre, enviados: r.links_added ?? 0, intentados: validos.length, omitidos: omitidos.length, convertidos, faltanConvertir })
    }

    // ───── Enviar a Tokchart los links que faltan ─────
    if (action === 'sync') {
      if (!conLinks) return res.status(400).json({ error: 'Este tipo de campaña no envía links automáticamente.' })
      if (!uuidActual) return res.status(200).json({ sinReporte: true })
      const { validos, omitidos, convertidos, faltanConvertir } = await linksPendientes(camp.id, plataforma)
      let enviados = 0
      for (let i = 0; i < validos.length; i += CHUNK) {
        const parte = validos.slice(i, i + CHUNK)
        await tokchart(`/campaigns/${tt ? 'tiktok' : 'instagram'}/${uuidActual}`, { links: parte })
        await marcarEnviados(camp.id, plataforma, parte)
        enviados += parte.length
      }
      return res.status(200).json({ enviados, omitidos: omitidos.length, convertidos, faltanConvertir })
    }

    return res.status(400).json({ error: 'Acción desconocida' })
  } catch (e) {
    console.error('tokchart error:', e.message)
    const code = e.status === 401 || e.status === 403 ? 502 : (e.status && e.status < 500 ? 422 : 502)
    return res.status(code).json({ error: e.message })
  }
}
