import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { resolverPropuesta } from './_propuestas.js'

// Aprobar o rechazar una propuesta de un agente. Solo usuarios con sesión (Lucas/Nico):
// el agente usa otra clave (AGENTES_TOKEN) que aquí no sirve, así que no puede aprobarse solo.
// POST { id, aprobar: true|false }  con  Authorization: Bearer <token de sesión>

const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No autorizado. Iniciá sesión de nuevo.' })
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return res.status(401).json({ error: 'Sesión inválida o expirada.' })

  const { id, aprobar } = req.body || {}
  if (!id || typeof aprobar !== 'boolean') return res.status(400).json({ error: 'Faltan datos (id y aprobar)' })

  const client = await pool.connect()
  try {
    const r = await resolverPropuesta(client, { id, aprobar, email: data.user.email })
    return res.status(r.ok ? 200 : 409).json(r)
  } catch (e) {
    console.error('propuestas:', e.message)
    return res.status(500).json({ error: e.message })
  } finally {
    client.release()
  }
}
