import supabase from './supabaseClient'

// Un link de TikTok "bueno" ya es de escritorio: tiktok.com/@usuario/video/ID
export function isDesktopTikTok(url) {
  return /tiktok\.com\/@[^/]+\/(video|photo)\/\d+/.test(url || '')
}

// Saca el usuario y el ID del video de un link de escritorio de TikTok
export function parseTikTok(url) {
  const m = (url || '').match(/tiktok\.com\/@([^/?#]+)\/(?:video|photo)\/(\d+)/)
  return m ? { handle: m[1], video_id: m[2] } : { handle: '', video_id: '' }
}

// Separa un texto pegado (de Excel, una lista, etc.) en links únicos, en el mismo orden
export function extraerLinks(texto) {
  const vistos = new Set()
  const out = []
  for (const parte of (texto || '').split(/[\s,;"]+/)) {
    const l = parte.trim()
    if (!/^https?:\/\//i.test(l) || vistos.has(l)) continue
    vistos.add(l)
    out.push(l)
  }
  return out
}

// Link corto/móvil que hay que convertir (vt., vm., tiktok.com/t/...)
export function isMobileTikTok(url) {
  const u = (url || '').trim()
  return /^https?:\/\/(vt|vm|m)\.tiktok\.com\//i.test(u) || /^https?:\/\/(www\.)?tiktok\.com\/t\//i.test(u)
}

// Convierte un link. Si no es móvil, lo devuelve igual. Si falla, devuelve
// { url: original, error } para no perder nunca lo que pegó el usuario.
export async function convertTikTok(url) {
  const original = (url || '').trim()
  if (!original || !isMobileTikTok(original)) return { url: original }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/expand', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ url: original }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.result) return { url: original, error: json.error || 'No se pudo convertir' }
    return { url: json.result }
  } catch (e) {
    return { url: original, error: e.message }
  }
}

// Convierte varios links con pocas peticiones a la vez (3)
export async function convertMany(urls, limit = 3) {
  const out = new Array(urls.length)
  let i = 0
  async function worker() {
    while (i < urls.length) {
      const idx = i++
      out[idx] = await convertTikTok(urls[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker))
  return out
}

// Instagram: solo quita parámetros de seguimiento (?stkn=, ?igsh=, utm_*)
export function cleanInstagram(url) {
  const raw = (url || '').trim()
  if (!/instagram\.com/i.test(raw)) return raw
  try {
    const u = new URL(raw)
    return u.origin + u.pathname
  } catch { return raw }
}

// ───── Tokchart (vía /api/tokchart, solo usuarios con login) ─────
export async function tokchartCall(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/tokchart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, ...json }
}
