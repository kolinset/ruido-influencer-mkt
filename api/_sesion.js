import { createClient } from '@supabase/supabase-js'

// Verifica la sesión de Roster (Lucas/Nico logueados) y la recuerda unos minutos,
// para no consultar a Supabase en cada pedido. (El "_" al inicio evita que Vercel lo exponga como ruta.)
const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
const SESION_OK_MS = 2 * 60 * 1000
const sesiones = new Map() // token → vence (ms)

export async function sesionValida(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) return false
  const vence = sesiones.get(token)
  if (vence && vence > Date.now()) return true
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) { sesiones.delete(token); return false }
  if (sesiones.size > 500) sesiones.clear()
  sesiones.set(token, Date.now() + SESION_OK_MS)
  return true
}
