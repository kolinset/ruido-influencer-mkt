import pg from 'pg'
import { sesionValida } from './_sesion.js'
import { obtenerMetricas } from './_metricas.js'

// Social Boost → "Cuentas": cómo rinde cada cuenta de TikTok en un mes (o en todo el histórico),
// cruzando los videos subidos con las métricas del reporte de Tokchart de cada canción.
// - Con sesión (Roster): todas las cuentas + los ajustes de visibilidad.
// - Sin sesión (portal del cliente): solo si la pestaña está activada y sin las cuentas ocultas.

export const config = { maxDuration: 60 }

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })
const MES_RE = /^\d{4}-\d{2}-01$/
const MAX_LECTURAS = 25 // reportes que se leen de Tokchart por pedido (para no pasar el tiempo límite)

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

function mesActualChile() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-01`
}

// Ajustes de visibilidad (si las tablas/columnas todavía no existen, se asume: pestaña oculta y todas las cuentas visibles)
async function leerAjustes() {
  try {
    const r = (await pool.query("SELECT valor FROM ajustes WHERE clave = 'sb_cuentas_portal'")).rows[0]
    return { portal: r?.valor === true, listo: true }
  } catch { return { portal: false, listo: false } }
}
async function cuentasOcultas() {
  try { return new Set((await pool.query('SELECT id FROM sb_cuentas WHERE visible_cliente = false')).rows.map(r => r.id)) }
  catch { return new Set() }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const admin = await sesionValida(req)
  const periodo = (req.body || {}).mes || mesActualChile()
  const todo = periodo === 'todo'
  if (!todo && !MES_RE.test(periodo)) return res.status(400).json({ error: 'Mes inválido' })

  try {
    const ajustes = await leerAjustes()
    if (!admin && !ajustes.portal) return res.status(200).json({ disponible: false })
    const ocultas = admin ? new Set() : await cuentasOcultas()

    // Meses con videos (para el selector)
    const meses = (await pool.query(`
      SELECT DISTINCT c.mes::text AS mes FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id
      WHERE c.mes IS NOT NULL ORDER BY 1 DESC`)).rows.map(r => r.mes)

    // Videos del período, con su cuenta (la elegida a mano o la que coincide con el usuario del link)
    const videos = (await pool.query(`
      SELECT v.id, v.video_id, v.link_web, v.link_original, v.handle, v.created_at,
        c.id AS cancion_id, c.cancion, c.artista, c.mes::text AS mes,
        cu.id AS cuenta_id, cu.nombre AS cuenta_nombre, cu.handle AS cuenta_handle
      FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id
      LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
      WHERE ($1::boolean OR c.mes = $2::date)
      ORDER BY v.created_at DESC`, [todo, todo ? null : periodo])).rows

    // Métricas de cada canción: las del mes en curso se actualizan si tienen más de 1 hora; las antiguas
    // se toman de lo guardado (solo se leen si nunca se leyeron).
    const mesActual = mesActualChile()
    const canciones = [...new Map(videos.map(v => [v.cancion_id, v])).values()]
    let lecturas = 0
    const metricas = await mapLimit(canciones, 4, async v => {
      const reciente = v.mes === mesActual
      const yaGuardada = (await pool.query('SELECT 1 FROM sb_metricas WHERE cancion_id = $1 AND fetched_at IS NOT NULL', [v.cancion_id])).rows.length > 0
      if (!reciente && yaGuardada) return obtenerMetricas(pool, { cancion_id: v.cancion_id }, { frescoMin: 1e9 }).catch(() => null)
      if (lecturas >= MAX_LECTURAS) return obtenerMetricas(pool, { cancion_id: v.cancion_id }, { frescoMin: 1e9 }).catch(() => null)
      lecturas++
      return obtenerMetricas(pool, { cancion_id: v.cancion_id }, { frescoMin: 60 }).catch(() => null)
    })
    const porVideo = {}
    for (const m of metricas) {
      if (!m?.disponible) continue
      for (const p of Object.values(m.plataformas).flatMap(x => x.posts || [])) porVideo[p.video_id] = p
    }

    // Agrupar por cuenta
    const grupos = {}
    for (const v of videos) {
      if (v.cuenta_id && ocultas.has(v.cuenta_id)) continue
      const clave = v.cuenta_id || ('@' + (v.handle || 'sin-usuario'))
      const g = grupos[clave] ||= {
        clave, cuenta_id: v.cuenta_id || null,
        nombre: v.cuenta_nombre || (v.handle ? '@' + v.handle : 'Sin cuenta'),
        handle: (v.cuenta_handle || v.handle || '').replace('@', ''),
        videos: [], canciones: {},
      }
      const p = v.video_id ? porVideo[v.video_id] : null
      g.videos.push({
        video_id: v.video_id || v.id, plat: 'tiktok', link: p?.link || v.link_web || v.link_original, handle: p?.handle || v.handle,
        thumb: p?.thumb || (v.video_id ? `https://assets.tokchart.com/video_thumbnails/${v.video_id}` : ''),
        followers: p?.followers ?? null, fecha: p?.fecha || '', engagement: p?.engagement ?? null,
        views: p?.views ?? null, likes: p?.likes ?? null, comments: p?.comments ?? null, saves: p?.saves ?? null, shares: p?.shares ?? null,
        cancion: v.cancion, artista: v.artista, conMetricas: !!p,
      })
      const c = g.canciones[v.cancion_id] ||= { cancion: v.cancion, artista: v.artista, videos: 0, views: 0 }
      c.videos++; c.views += p?.views || 0
    }
    const cuentas = Object.values(grupos).map(g => {
      const con = g.videos.filter(x => x.conMetricas)
      const suma = k => con.reduce((a, x) => a + (x[k] || 0), 0)
      const engs = con.map(x => x.engagement).filter(x => x != null)
      const mejor = [...con].sort((a, b) => (b.views || 0) - (a.views || 0))[0] || null
      return {
        clave: g.clave, cuenta_id: g.cuenta_id, nombre: g.nombre, handle: g.handle,
        videos: g.videos.length, conMetricas: con.length,
        views: suma('views'), likes: suma('likes'), comments: suma('comments'), shares: suma('shares'), saves: suma('saves'),
        promedio: con.length ? suma('views') / con.length : null,
        engagement: engs.length ? engs.reduce((a, b) => a + b, 0) / engs.length : null,
        mejor: mejor ? { handle: mejor.handle, views: mejor.views, link: mejor.link } : null,
        canciones: Object.values(g.canciones).sort((a, b) => b.views - a.views),
        lista: g.videos,
      }
    }).sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1))

    let visibilidad = null
    if (admin) {
      let filas = []
      try { filas = (await pool.query('SELECT id, nombre, handle, visible_cliente FROM sb_cuentas ORDER BY nombre')).rows }
      catch { filas = (await pool.query('SELECT id, nombre, handle, true AS visible_cliente FROM sb_cuentas ORDER BY nombre')).rows }
      visibilidad = { portal: ajustes.portal, listo: ajustes.listo, cuentas: filas }
    }

    return res.status(200).json({
      disponible: true, periodo: todo ? 'todo' : periodo, meses, cuentas,
      totalVideos: cuentas.reduce((a, c) => a + c.videos, 0),
      conMetricas: cuentas.reduce((a, c) => a + c.conMetricas, 0),
      visibilidad,
    })
  } catch (e) {
    console.error('sb-cuentas error:', e.message)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
