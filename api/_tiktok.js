// Funciones compartidas para links de TikTok (el "_" al inicio evita que Vercel lo exponga como ruta).

const TIMEOUT_MS = 8000

export function isTikTokHost(urlStr) {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const h = u.hostname.toLowerCase()
    return h === 'tiktok.com' || h.endsWith('.tiktok.com')
  } catch { return false }
}

export function isValidTikTokUrl(url) {
  return (
    url &&
    isTikTokHost(url) &&
    url.includes('tiktok.com/@') &&
    (url.includes('/video/') || url.includes('/photo/')) &&
    !url.match(/\/@\/(video|photo)\//)
  )
}

export function parseVideo(link) {
  const m = (link || '').match(/tiktok\.com\/@([^/?#]+)\/(?:video|photo)\/(\d+)/)
  return m ? { handle: m[1], video_id: m[2] } : { handle: '', video_id: '' }
}

function cleanUrl(url) {
  try {
    const u = new URL(url)
    const keep = ['_r', '_t']
    const p = new URLSearchParams()
    for (const [k, v] of u.searchParams) if (keep.includes(k)) p.set(k, v)
    const base = 'https://www.tiktok.com' + u.pathname
    const qs = p.toString()
    return qs ? base + '?' + qs : base
  } catch { return url }
}

export async function expandTikTok(url) {
  if (isValidTikTokUrl(url)) return cleanUrl(url)

  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
  }

  const resp = await fetch(url, { method: 'GET', redirect: 'follow', headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const finalUrl = resp.url
  if (!isTikTokHost(finalUrl)) return null
  if (isValidTikTokUrl(finalUrl)) {
    try { await resp.body?.cancel() } catch {}
    return cleanUrl(finalUrl)
  }

  const html = await resp.text()

  const ogUrl = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i)?.[1]
    || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:url"/i)?.[1]
  if (ogUrl && isValidTikTokUrl(ogUrl)) return cleanUrl(ogUrl)

  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)?.[1]
  if (canonical && isValidTikTokUrl(canonical)) return cleanUrl(canonical)

  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (nextDataMatch) {
    try {
      const d = JSON.parse(nextDataMatch[1])
      const item = d?.props?.pageProps?.itemInfo?.itemStruct
      if (item) {
        const author = item?.author?.uniqueId
        const id = item?.id
        const isPhoto = item?.imagePost || item?.mediaType === 'image' || (item?.imageList && item.imageList.length > 0)
        if (author && id) return `https://www.tiktok.com/@${author}/${isPhoto ? 'photo' : 'video'}/${id}`
      }
    } catch (_) {}
  }

  const contentUrl = html.match(/https:\/\/www\.tiktok\.com\/@[^/"\\]+\/(video|photo)\/\d+/)?.[0]
  if (contentUrl) return cleanUrl(contentUrl)

  return null
}
