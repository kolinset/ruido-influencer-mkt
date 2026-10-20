import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { sincronizarCancionSB } from './_sbTokchart.js'

// Social Boost (Roster, con login): crea o actualiza el reporte de Tokchart de una canción.
export const config = { maxDuration: 30 }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado. Iniciá sesión de nuevo.' })
  const { data, error } = await supabaseAuth.auth.getUser(h.slice(7))
  if (error || !data?.user) return res.status(401).json({ error: 'Sesión inválida o expirada.' })

  const { cancion_id } = req.body || {}
  if (!UUID_RE.test(cancion_id || '')) return res.status(400).json({ error: 'Canción inválida' })
  try {
    return res.status(200).json(await sincronizarCancionSB(pool, cancion_id))
  } catch (e) {
    console.error('sb-tokchart error:', e.message)
    return res.status(502).json({ ok: false, error: e.message })
  }
}
