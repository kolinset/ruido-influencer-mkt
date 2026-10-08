import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// Cliente de Supabase (server-side) solo para validar el token de sesión
// que manda el navegador. Usa la misma URL/clave pública que el frontend
// (no hace falta la service role key solo para esto).
const supabaseAuth = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// Pool de conexión a Postgres. SUPABASE_DB_URL es server-only (sin
// prefijo VITE_), así que nunca se incluye en el bundle que baja al
// navegador — es la única pieza que reemplaza a la vieja VITE_DATABASE_URL.
const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 1, // funciones serverless: una conexión corta por invocación
})

function isSelect(text) {
  // Saca comentarios y espacios en blanco iniciales para mirar la primera palabra real
  const clean = text.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)*/g, '').trim()
  return /^select/i.test(clean)
}

function hasMultipleStatements(text) {
  // Bloquea intentos de "apilar" varias sentencias en una sola consulta
  const withoutStrings = text.replace(/\$\$[\s\S]*?\$\$|'[^']*'/g, '')
  return withoutStrings.trim().replace(/;\s*$/, '').includes(';')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { text, params } = req.body || {}
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Falta la consulta' })
  }
  if (hasMultipleStatements(text)) {
    return res.status(400).json({ error: 'No se permite más de una sentencia por consulta' })
  }

  // La tabla de links de la editora nunca se lee sin sesión, ni siquiera con SELECT.
  const readOnly = isSelect(text) && !/sb_editor_tokens/i.test(text)

  if (!readOnly) {
    // Crear, editar o borrar algo exige sesión válida (Lucas/Nico logueados)
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'No autorizado. Iniciá sesión de nuevo.' })
    }
    const { data, error } = await supabaseAuth.auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Iniciá sesión de nuevo.' })
    }
  }

  try {
    const result = await pool.query(text, Array.isArray(params) ? params : [])
    return res.status(200).json({ rows: result.rows })
  } catch (e) {
    console.error('DB error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
