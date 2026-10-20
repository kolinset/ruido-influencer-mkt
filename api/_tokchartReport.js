// Lee las métricas de la página PÚBLICA de un reporte de Tokchart (la misma que ve el cliente).
// Tokchart no tiene una API para leer métricas, así que se lee el HTML de la página.
// Si Tokchart cambia el diseño, parseReport lanza un error y NO se pisan los datos guardados.
// (El "_" al inicio evita que Vercel lo exponga como ruta.)

const TIMEOUT_MS = 12000
const MAX_PAGINAS = 15

// Solo se aceptan links de reportes de Tokchart (evita que se use para leer otras páginas)
export function isTokchartReportUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'tokchart.com' || u.hostname === 'www.tokchart.com') &&
      /^\/campaigns\/(instagram\/)?[0-9a-f-]{36}\/?$/i.test(u.pathname)
  } catch { return false }
}

const decode = s => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
const texto = html => decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const entero = s => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null }
const decimal = s => { const m = String(s || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null }

// "208K", "1.2M", "953K", "5,123" → número aproximado
function abreviado(s) {
  const m = String(s || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KMB])?/i)
  if (!m) return null
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1
  return Math.round(Number(m[1]) * mult)
}

export function parseReport(html) {
  // ── Totales: tarjetas "Views / 44K / 44,494 total" ──
  const tarjetas = {}
  const reCard = /uppercase tracking-wide[^>]*>\s*([^<]+?)\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g
  for (const m of html.matchAll(reCard)) {
    const label = texto(m[1]).toLowerCase()
    if (!(label in tarjetas)) tarjetas[label] = { corto: texto(m[2]), detalle: texto(m[3]) }
  }
  const total = label => {
    const t = tarjetas[label]
    if (!t) return null
    const exacto = t.detalle.match(/([\d,]+)\s+total/i)
    return exacto ? entero(exacto[1]) : abreviado(t.corto)
  }
  const views = total('views')
  if (views == null) throw new Error('No se encontraron las views en el reporte (¿cambió el diseño de Tokchart?)')
  const eng = tarjetas['avg engagement']
  const engagement = eng ? decimal((eng.detalle.match(/([\d.]+)%\s*exact/i) || [])[1] ?? eng.corto) : null

  // ── Videos: filas <tr data-video-id="..."> leídas según los títulos de las columnas ──
  const tabla = html.slice(html.indexOf('Campaign Posts'))
  const ths = [...(tabla.match(/<thead[\s\S]*?<\/thead>/) || [''])[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => texto(m[1]).toLowerCase())
  const col = nombre => ths.findIndex(h => h === nombre)
  const posts = []
  for (const m of tabla.matchAll(/<tr[^>]*data-video-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celdas = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1])
    const link = (m[2].match(/href="(https:\/\/www\.(?:tiktok|instagram)\.com\/[^"]+)"/) || [])[1] || ''
    const handle = (m[2].match(/>\s*@([^<\s]+)\s*</) || [])[1] || ''
    const val = (nombre, fn) => { const i = col(nombre); return i >= 0 && celdas[i] != null ? fn(texto(celdas[i])) : null }
    posts.push({
      video_id: m[1], link, handle,
      followers: val('followers', abreviado),
      fecha: val('uploaded', s => s) || '',
      engagement: val('engagement', decimal),
      views: val('views', entero),
      likes: val('likes', entero),
      comments: val('comments', entero),
      saves: val('saves', entero),
      shares: val('shares', entero),
    })
  }

  const actualizado = (texto(html).match(/Last updated:\s*(.+?\bago)/i) || [])[1] || ''
  return {
    views, likes: total('likes'), comments: total('comments'), saves: total('saves'), shares: total('shares'),
    engagement, posts, tokchart_actualizado: actualizado,
  }
}

export async function fetchReport(url) {
  if (!isTokchartReportUrl(url)) throw new Error('El link del reporte no es de Tokchart')
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RosterKolinset/1.0)', Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`Tokchart respondió ${r.status}`)
  const rep = parseReport(await r.text())
  // Campañas grandes: la tabla de videos puede venir por páginas (?page=2...). Los totales siempre vienen completos.
  if (rep.posts.length >= 10) {
    const vistos = new Set(rep.posts.map(p => p.video_id))
    for (let pag = 2; pag <= MAX_PAGINAS; pag++) {
      try {
        const rr = await fetch(url + (url.includes('?') ? '&' : '?') + 'page=' + pag, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RosterKolinset/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!rr.ok) break
        const nuevos = parseReport(await rr.text()).posts.filter(p => !vistos.has(p.video_id))
        if (!nuevos.length) break
        nuevos.forEach(p => { vistos.add(p.video_id); rep.posts.push(p) })
      } catch { break }
    }
  }
  return rep
}
