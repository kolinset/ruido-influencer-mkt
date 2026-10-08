import pg from 'pg'
import { expandTikTok, isTikTokHost, parseVideo } from './_tiktok.js'

// Endpoint para el link privado de la editora. NO es un acceso general a la base:
// solo permite ver las canciones de una semana, agregar links de TikTok y borrar
// videos de esa semana. Todo se valida contra un token guardado en sb_editor_tokens.

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LINKS = 12

function esMovil(u) {
  return /^https?:\/\/(vt|vm|m)\.tiktok\.com\//i.test(u) || /^https?:\/\/(www\.)?tiktok\.com\/t\//i.test(u)
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const { token, action, inicio } = req.body || {}
  if (typeof token !== 'string' || token.length < 20) return res.status(401).json({ error: 'Link inválido' })
  if (!DATE_RE.test(inicio || '')) return res.status(400).json({ error: 'Semana inválida' })

  try {
    const tk = await pool.query('SELECT nombre FROM sb_editor_tokens WHERE token = $1 AND activo = true LIMIT 1', [token])
    if (!tk.rows.length) return res.status(401).json({ error: 'Este link no es válido o fue desactivado.' })
    const editor = tk.rows[0].nombre

    const sem = (await pool.query('SELECT id FROM sb_semanas WHERE inicio = $1', [inicio])).rows[0]

    if (action === 'state') {
      const cuentas = (await pool.query('SELECT id, nombre, handle FROM sb_cuentas WHERE activa = true ORDER BY nombre')).rows
      if (!sem) return res.status(200).json({ slots: [], videos: [], cuentas })
      const slots = (await pool.query(`
        SELECT ss.slot, c.id AS cancion_id, c.cancion, c.artista,
          (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id AND v.semana_id = ss.semana_id)::int AS vids_sem,
          (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id)::int AS vids_mes
        FROM sb_semana_slots ss JOIN sb_canciones c ON c.id = ss.cancion_id
        WHERE ss.semana_id = $1 ORDER BY ss.slot`, [sem.id])).rows
      const videos = (await pool.query(`
        SELECT id, cancion_id, link_web, link_original, handle, cuenta_id, created_at
        FROM sb_videos WHERE semana_id = $1 ORDER BY created_at DESC LIMIT 300`, [sem.id])).rows
      return res.status(200).json({ slots, videos, cuentas })
    }

    if (action === 'add') {
      const { cancion_id, links, cuenta_id } = req.body
      if (!sem) return res.status(400).json({ error: 'Esa semana todavía no está armada.' })
      if (!UUID_RE.test(cancion_id || '')) return res.status(400).json({ error: 'Canción inválida' })
      const ok = await pool.query('SELECT 1 FROM sb_semana_slots WHERE semana_id = $1 AND cancion_id = $2', [sem.id, cancion_id])
      if (!ok.rows.length) return res.status(403).json({ error: 'Esa canción no está activa esta semana.' })
      let cuenta = null
      if (cuenta_id) {
        if (!UUID_RE.test(cuenta_id)) return res.status(400).json({ error: 'Cuenta inválida' })
        const c = await pool.query('SELECT id FROM sb_cuentas WHERE id = $1', [cuenta_id])
        cuenta = c.rows[0]?.id || null
      }
      const lista = [...new Set((Array.isArray(links) ? links : []).map(l => String(l).trim()).filter(l => /^https?:\/\//i.test(l) && l.length < 500))]
      if (!lista.length) return res.status(400).json({ error: 'No hay links válidos.' })
      if (lista.length > MAX_LINKS) return res.status(400).json({ error: `Máximo ${MAX_LINKS} links por envío.` })

      const resueltos = await mapLimit(lista, 4, async (u) => {
        if (!isTikTokHost(u)) return { u, web: null, noTikTok: true }
        try { return { u, web: await expandTikTok(u) } } catch { return { u, web: null } }
      })

      let nuevos = 0, repetidos = 0, sinConvertir = 0, sinUsuario = 0, ignorados = 0
      for (const r of resueltos) {
        if (r.noTikTok) { ignorados++; continue }
        const web = r.web || ''
        if (!web) sinConvertir++
        const { handle, video_id } = parseVideo(web)
        const cu = handle ? null : cuenta
        if (web && !handle && !cu) sinUsuario++
        const ins = await pool.query(
          `INSERT INTO sb_videos (cancion_id, semana_id, cuenta_id, link_original, link_web, handle, video_id, agregado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
          [cancion_id, sem.id, cu, r.u, web, handle, video_id, editor])
        if (ins.rows.length) nuevos++; else repetidos++
      }
      return res.status(200).json({ nuevos, repetidos, sinConvertir, sinUsuario, ignorados })
    }

    if (action === 'delete') {
      const { video_id } = req.body
      if (!sem || !UUID_RE.test(video_id || '')) return res.status(400).json({ error: 'Video inválido' })
      const d = await pool.query('DELETE FROM sb_videos WHERE id = $1 AND semana_id = $2 RETURNING id', [video_id, sem.id])
      return res.status(200).json({ borrado: d.rows.length })
    }

    return res.status(400).json({ error: 'Acción desconocida' })
  } catch (e) {
    console.error('editor error:', e.message)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
