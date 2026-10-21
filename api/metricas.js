import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { obtenerMetricas } from './_metricas.js'

// Métricas de una campaña o de una canción de Social Boost, leídas del reporte público de Tokchart.
// Se usa desde el portal y la propuesta (sin login) y desde Roster.
// No necesita ninguna tarea programada: cuando alguien abre la campaña, si los datos
// tienen más de 30 minutos se vuelven a leer de Tokchart; si no, se muestran los guardados.

export const config = { maxDuration: 30 }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 })
const supabaseAuth = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function esAdmin(req) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Bearer ')) return false
  const { data, error } = await supabaseAuth.auth.getUser(h.slice(7))
  return !error && !!data?.user
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const { campaign_id, cancion_id, forzar } = req.body || {}
  const esCancion = !!cancion_id
  const id = esCancion ? cancion_id : campaign_id
  if (!UUID_RE.test(id || '')) return res.status(400).json({ error: esCancion ? 'Canción inválida' : 'Campaña inválida' })
  try {
    // "Actualizar ahora" desde Roster: solo con sesión, y como mínimo 1 minuto entre lecturas
    const forzado = forzar ? await esAdmin(req) : false
    const r = await obtenerMetricas(pool, esCancion ? { cancion_id: id } : { campaign_id: id }, { forzado })
    if (!r) return res.status(404).json({ error: esCancion ? 'Canción no encontrada' : 'Campaña no encontrada' })
    return res.status(200).json(r)
  } catch (e) {
    console.error('metricas error:', e.message)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
