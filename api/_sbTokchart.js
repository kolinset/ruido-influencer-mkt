import { isValidTikTokUrl } from './_tiktok.js'
import { tokchart, TT_REPORT_BASE, uuidDeReporteTT } from './_tokchartApi.js'

// Social Boost → Tokchart. Cada canción tiene su reporte de TikTok en Tokchart:
// - Si la canción es nueva, al subir su primer link se crea el reporte "[SB] Canción - Artista".
// - Si la canción se repite (misma canción y artista que antes, por ejemplo la semana pasada),
//   se sigue usando el mismo reporte.
// - Cada vez que se agregan o borran videos se manda a Tokchart la lista COMPLETA de links de ese
//   reporte (Tokchart reemplaza la lista con lo que recibe; ver api/tokchart.js).
// (El "_" al inicio evita que Vercel lo exponga como ruta.)

export async function sincronizarCancionSB(pool, cancionId) {
  if (!process.env.TOKCHART_API_TOKEN) return { ok: false, error: 'Falta configurar TOKCHART_API_TOKEN en Vercel.' }
  const song = (await pool.query('SELECT id, cancion, artista, tokchart_url FROM sb_canciones WHERE id = $1', [cancionId])).rows[0]
  if (!song) return { ok: false, error: 'Canción no encontrada' }

  let url = (song.tokchart_url || '').trim()
  let uuid = uuidDeReporteTT(url)
  let reutilizado = false

  // ¿La misma canción ya tiene reporte? (por ejemplo, la ficha de la semana o el mes anterior)
  if (!uuid && !url) {
    const prev = (await pool.query(`
      SELECT tokchart_url FROM sb_canciones
      WHERE id <> $1 AND lower(trim(cancion)) = lower(trim($2)) AND lower(trim(coalesce(artista, ''))) = lower(trim($3))
        AND tokchart_url ~* '^https://(www\\.)?tokchart\\.com/campaigns/[0-9a-f-]{36}/?$'
      ORDER BY mes DESC NULLS LAST LIMIT 1`, [song.id, song.cancion || '', song.artista || ''])).rows[0]
    if (prev) {
      url = prev.tokchart_url.trim(); uuid = uuidDeReporteTT(url); reutilizado = true
      await pool.query("UPDATE sb_canciones SET tokchart_url = $1 WHERE id = $2 AND coalesce(tokchart_url, '') = ''", [url, song.id])
    }
  }
  // Si tiene un link puesto a mano que no es un reporte de TikTok de Tokchart, no se toca
  if (!uuid && url) return { ok: false, error: 'El link de Tokchart de esta canción no es un reporte de TikTok; no se envió nada.' }

  // Todos los videos que van a ese reporte (esta canción + las otras fichas que comparten el mismo reporte)
  const rows = (await pool.query(`
    SELECT v.link_web FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id
    WHERE v.link_web <> '' AND (c.id = $1 OR ($2::text <> '' AND trim(c.tokchart_url) = $2))
    ORDER BY v.created_at`, [song.id, url])).rows
  const links = [...new Set(rows.map(r => r.link_web.trim()).filter(isValidTikTokUrl))]

  if (!uuid) {
    if (!links.length) return { ok: true, sinLinks: true }
    const nombre = `[SB] ${[song.cancion, song.artista].filter(Boolean).join(' - ')}`.slice(0, 255)
    const r = await tokchart('/campaigns/tiktok', { name: nombre, links })
    if (!r.uuid) throw new Error('Tokchart no devolvió el identificador del reporte.')
    url = TT_REPORT_BASE + r.uuid
    await pool.query("UPDATE sb_canciones SET tokchart_url = $1 WHERE id = $2 AND coalesce(tokchart_url, '') = ''", [url, song.id])
    return { ok: true, creado: true, nombre, url, enviados: r.links_added ?? links.length }
  }

  if (links.length) await tokchart(`/campaigns/tiktok/${uuid}`, { links })
  return { ok: true, reutilizado, url, enviados: links.length }
}
