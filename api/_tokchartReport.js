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

// Celda de número: si trae el valor exacto ("74K" + "73,982") se usa el exacto
const celdaNum = html => {
  const ex = html.match(/class="[^"]*\bui-ex\b[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  return texto(ex ? ex[1] : html)
}
// Nombres de columna de Tokchart → nombre interno (en Instagram "Views" se llama "Plays")
const COLUMNAS = { followers: 'followers', posted: 'fecha', uploaded: 'fecha', engagement: 'engagement', views: 'views', plays: 'views', likes: 'likes', comments: 'comments', saves: 'saves', shares: 'shares' }

export function parseReport(html) {
  // ── Tabla de videos: títulos de columna, filas <tr data-id> y fila "Total" del pie ──
  const ini = html.indexOf('<table'), fin = html.indexOf('</table>', ini)
  const actualizado = (texto(html).match(/(?:Last updated:|Updated)\s*(.+?\bago)/i) || [])[1] || ''
  // Reporte recién creado, todavía sin videos: no hay tabla, se devuelve todo en cero
  if ((ini < 0 || fin < 0) && /campaign report/i.test(html) && !/data-id="\d+"/.test(html)) {
    return { views: 0, likes: 0, comments: 0, saves: 0, shares: 0, engagement: null, posts: [], totalPosts: 0, tokchart_actualizado: actualizado }
  }
  if (ini < 0 || fin < 0) throw new Error('No se encontró la tabla de videos en el reporte (¿cambió el diseño de Tokchart?)')
  const tabla = html.slice(ini, fin)
  const ths = [...(tabla.match(/<thead[\s\S]*?<\/thead>/) || [''])[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
    .map(m => COLUMNAS[texto(m[1]).replace(/\?/g, '').trim().toLowerCase()] || null)
  const col = nombre => ths.indexOf(nombre)
  const celdasDe = fila => [...fila.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1])

  const cuerpo = (tabla.match(/<tbody[\s\S]*?<\/tbody>/) || [''])[0]
  const posts = []
  for (const m of cuerpo.matchAll(/<tr[^>]*\bdata-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const celdas = celdasDe(m[2])
    const link = (m[2].match(/href="(https:\/\/www\.(?:tiktok\.com\/@[^"/]+\/(?:video|photo)\/\d+|instagram\.com\/(?:[^"/]+\/)?(?:reel|reels|p|tv)\/[^"/?]+)[^"]*)"/) || [])[1] || ''
    const handle = (m[2].match(/>\s*@([^<\s]+)\s*</) || [])[1] || ''
    const thumb = (m[2].match(/<img[^>]+src="(https:\/\/assets\.tokchart\.com\/[^"]+)"/) || [])[1] || ''
    const val = (nombre, fn) => { const i = col(nombre); return i >= 0 && celdas[i] != null ? fn(celdaNum(celdas[i])) : null }
    // TikTok: el ID del video sale del link; Instagram: el número de fila de Tokchart
    const ttId = (link.match(/tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d+)/) || [])[1]
    posts.push({
      video_id: ttId || m[1], link, handle, thumb,
      followers: val('followers', abreviado),
      fecha: val('fecha', s => s) || '',
      engagement: val('engagement', decimal),
      views: val('views', entero),
      likes: val('likes', entero),
      comments: val('comments', entero),
      saves: val('saves', entero),
      shares: val('shares', entero),
    })
  }

  // ── Totales: fila "Total · N posts" al pie de la tabla ──
  const pie = celdasDe((tabla.match(/<tfoot[\s\S]*?<\/tfoot>/) || [''])[0])
  const total = nombre => { const i = col(nombre); const t = i >= 0 && pie[i] != null ? texto(pie[i]) : ''; return t ? entero(t) : null }
  const views = total('views') ?? (posts.length ? null : 0)
  if (views == null) throw new Error('No se encontraron las views en el reporte (¿cambió el diseño de Tokchart?)')
  const engTxt = col('engagement') >= 0 ? texto(pie[col('engagement')] || '') : ''
  const totalPosts = entero((texto(pie.join(' ')).match(/Total\s*·\s*([\d,]+)\s*posts?/i) || [])[1])

  return {
    views, likes: total('likes'), comments: total('comments'), saves: total('saves'), shares: total('shares'),
    engagement: engTxt ? decimal(engTxt) : null, posts, totalPosts, tokchart_actualizado: actualizado,
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
  // Campañas grandes: si la tabla no trae todos los videos, se piden las páginas siguientes (?page=2...).
  // Los totales siempre vienen completos.
  if (rep.totalPosts ? rep.posts.length < rep.totalPosts : rep.posts.length >= 10) {
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
