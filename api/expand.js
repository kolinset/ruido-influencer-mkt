import { createClient } from '@supabase/supabase-js'
import { expandTikTok, isTikTokHost } from './_tiktok.js'

// Convierte links móviles de TikTok al link de escritorio. Solo para usuarios logueados.
const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No autorizado. Iniciá sesión de nuevo.' })
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return res.status(401).json({ error: 'Sesión inválida o expirada.' })

  const url = req.body?.url
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Falta el link' })
  const clean = url.trim()
  if (!isTikTokHost(clean)) return res.status(400).json({ error: 'Solo se aceptan links de TikTok' })

  try {
    const result = await expandTikTok(clean)
    if (!result) return res.status(422).json({ error: 'No se pudo resolver el link' })
    return res.status(200).json({ result })
  } catch (err) {
    return res.status(500).json({ error: err.name === 'AbortError' || err.name === 'TimeoutError' ? 'TikTok tardó demasiado' : err.message })
  }
}
