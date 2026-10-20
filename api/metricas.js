import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { fetchReport, isTokchartReportUrl } from './_tokchartReport.js'

// Métricas de una campaña leídas del reporte público de Tokchart.
// Se usa desde el portal y la propuesta (sin login) y desde Roster.
// No necesita ninguna tarea programada: cuando alguien abre la campaña, si los datos
// tienen más de 30 minutos se vuelven a leer de Tokchart; si no, se muestran los guardados.

export const config = { maxDuration: 30 }

const FRESCO_MIN = 30      // minutos que se consideran "frescos"
const REINTENTO_MIN = 5    // si Tokchart falló, no reintentar antes de esto
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })
const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const hace = (fecha, min) => fecha && (Date.now() - new Date(fecha).getTime()) < min * 60000

async function esAdmin(req) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return false
  const { data, error } = await supabaseAuth.auth.getUser(h.slice(7))
  return !error && !!data?.user
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const { campaign_id, cancion_id, forzar } = req.body || {}
  // Sirve para campañas (campaign_id) y para canciones de Social Boost (cancion_id)
  const esCancion = !!cancion_id
  const id = esCancion ? cancion_id : campaign_id
  if (!UUID_RE.test(id || '')) return res.status(400).json({ error: esCancion ? 'Canción inválida' : 'Campaña inválida' })
  // Nombres fijos de tabla y columna (no vienen del usuario)
  const tabla = esCancion ? 'sb_metricas' : 'campaign_metrics'
  const col = esCancion ? 'cancion_id' : 'campaign_id'

  try {
    const camp = esCancion
      ? (await pool.query("SELECT id, tokchart_url AS reporte_url_tt, '' AS reporte_url_ig FROM sb_canciones WHERE id = $1", [id])).rows[0]
      : (await pool.query('SELECT id, reporte_url_tt, reporte_url_ig, views_logradas FROM campaigns WHERE id = $1', [id])).rows[0]
    if (!camp) return res.status(404).json({ error: esCancion ? 'Canción no encontrada' : 'Campaña no encontrada' })
    const campaign_id = id

    // "Actualizar ahora" desde Roster: solo con sesión, y como mínimo 1 minuto entre lecturas
    const forzado = forzar ? await esAdmin(req) : false
    const guardadas = Object.fromEntries((await pool.query(`SELECT * FROM ${tabla} WHERE ${col} = $1`, [campaign_id])).rows.map(r => [r.plataforma, r]))

    const fuentes = [['tiktok', camp.reporte_url_tt], ['instagram', camp.reporte_url_ig]].filter(([, url]) => isTokchartReportUrl((url || '').trim()))
    const out = {}
    const errores = {} // reportes que no se pudieron leer (para avisar en Roster)
    for (const [plat, url] of fuentes) {
      let fila = guardadas[plat]
      const fresco = forzado ? hace(fila?.fetched_at, 1) : (hace(fila?.fetched_at, FRESCO_MIN) || hace(fila?.intento_at, REINTENTO_MIN))
      if (!fresco) {
        try {
          const r = await fetchReport(url.trim())
          fila = (await pool.query(`
            INSERT INTO ${tabla} (${col}, plataforma, views, likes, comments, saves, shares, engagement, posts, fetched_at, intento_at, error)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now(), '')
            ON CONFLICT (${col}, plataforma) DO UPDATE SET views = EXCLUDED.views, likes = EXCLUDED.likes, comments = EXCLUDED.comments,
              saves = EXCLUDED.saves, shares = EXCLUDED.shares, engagement = EXCLUDED.engagement, posts = EXCLUDED.posts,
              fetched_at = now(), intento_at = now(), error = ''
            RETURNING *`,
            [campaign_id, plat, r.views, r.likes, r.comments, r.saves, r.shares, r.engagement, JSON.stringify(r.posts)])).rows[0]
        } catch (e) {
          // Si Tokchart falla o cambió su página, se guardan los datos anteriores tal cual y solo se anota el error
          console.error('metricas tokchart', plat, e.message)
          fila = (await pool.query(`
            INSERT INTO ${tabla} (${col}, plataforma, intento_at, error) VALUES ($1, $2, now(), $3)
            ON CONFLICT (${col}, plataforma) DO UPDATE SET intento_at = now(), error = EXCLUDED.error
            RETURNING *`, [campaign_id, plat, String(e.message).slice(0, 300)])).rows[0]
        }
      }
      if (fila?.error) errores[plat] = fila.error
      if (fila?.fetched_at) {
        out[plat] = {
          views: Number(fila.views) || 0, likes: Number(fila.likes) || 0, comments: Number(fila.comments) || 0,
          saves: Number(fila.saves) || 0, shares: Number(fila.shares) || 0,
          engagement: fila.engagement != null ? Number(fila.engagement) : null,
          posts: fila.posts || [], actualizado: fila.fetched_at, error: fila.error || '',
        }
      }
    }

    const plats = Object.values(out)
    if (!plats.length) return res.status(200).json({ disponible: false, errores })
    const suma = k => plats.reduce((a, p) => a + (p[k] || 0), 0)
    const total = { views: suma('views'), likes: suma('likes'), comments: suma('comments'), saves: suma('saves'), shares: suma('shares') }

    // "Views logradas" de la campaña se mantiene al día con Tokchart
    if (!esCancion && total.views > 0 && Number(camp.views_logradas) !== total.views) {
      await pool.query('UPDATE campaigns SET views_logradas = $1 WHERE id = $2', [total.views, campaign_id])
    }

    // Engagement promedio: el de Tokchart si hay un solo reporte; si hay TikTok + Instagram, el promedio de todos los videos
    const engs = plats.flatMap(p => p.posts.map(x => x.engagement)).filter(v => v != null)
    const engagement = plats.length === 1 ? plats[0].engagement : (engs.length ? engs.reduce((a, b) => a + b, 0) / engs.length : null)

    return res.status(200).json({
      disponible: true,
      total,
      engagement,
      plataformas: out,
      actualizado: plats.map(p => p.actualizado).sort()[0],
      aviso: plats.some(p => p.error) ? 'No se pudo actualizar desde Tokchart; se muestran los últimos datos guardados.' : '',
      errores,
    })
  } catch (e) {
    console.error('metricas error:', e.message)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
