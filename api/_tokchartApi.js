// Llamadas a la API de Tokchart (el token vive solo en el servidor: TOKCHART_API_TOKEN en Vercel).
// El "_" al inicio evita que Vercel lo exponga como ruta.

export const TOKCHART = 'https://tokchart.com/api/v1'
export const TT_REPORT_BASE = 'https://tokchart.com/campaigns/'
export const IG_REPORT_BASE = 'https://tokchart.com/campaigns/instagram/'

export async function tokchart(path, body) {
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

// UUID de un reporte de TikTok a partir de su link público (https://tokchart.com/campaigns/<uuid>)
export function uuidDeReporteTT(url) {
  const m = String(url || '').trim().match(/^https:\/\/(?:www\.)?tokchart\.com\/campaigns\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)
  return m ? m[1].toLowerCase() : null
}

// UUID de un reporte de Instagram a partir de su link público (https://tokchart.com/campaigns/instagram/<uuid>)
export function uuidDeReporteIG(url) {
  const m = String(url || '').trim().match(/^https:\/\/(?:www\.)?tokchart\.com\/campaigns\/instagram\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)
  return m ? m[1].toLowerCase() : null
}

// Link de Instagram en el formato que pide Tokchart: https://www.instagram.com/reel/<código>/
// Acepta /reel/, /reels/, /p/, /tv/ y el formato nuevo /<usuario>/reel/<código>; si no reconoce el link, devuelve null.
export function reelIG(url) {
  try {
    const u = new URL(String(url || '').trim())
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)
    return m ? `https://www.instagram.com/reel/${m[1]}/` : null
  } catch { return null }
}
