import { useState } from 'react'
import sql from '../lib/db'

// Brief de la campaña: se guarda como texto (campaigns.brief) para que los agentes de IA puedan leerlo.
// Se puede editar también en campañas cerradas, para cargar los briefs de campañas pasadas.
// El cliente no lo ve: las páginas públicas no consultan este campo.
export default function BriefCampana({ camp, onUpdate }) {
  const guardado = camp.brief || ''
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(guardado)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function editar() {
    setTexto(guardado)
    setError('')
    setEditando(true)
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await sql`UPDATE campaigns SET brief = ${texto.trim()} WHERE id = ${camp.id}`
      await onUpdate()
      setEditando(false)
    } catch (e) {
      console.error(e)
      setError('No se pudo guardar el brief. Inténtalo de nuevo.')
    }
    setGuardando(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 500 }}>Brief de la campaña</h2>
        {!editando && guardado && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={editar}>Editar</button>
        )}
      </div>

      {editando ? (
        <div>
          <textarea className="input" rows={16} value={texto} autoFocus
            onChange={e => setTexto(e.target.value)}
            placeholder="Pega aquí el brief: objetivo, concepto, estilo de contenido, público, qué se pidió a los influencers…"
            style={{ resize: 'vertical', lineHeight: 1.5 }} />
          {error && <p style={{ fontSize: 12, color: '#C0392B', marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="btn-ghost" disabled={guardando} onClick={() => setEditando(false)}>Cancelar</button>
            <button className="btn-red" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar brief'}</button>
          </div>
        </div>
      ) : guardado ? (
        <div className="card" style={{ padding: 16, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{guardado}</div>
      ) : (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Esta campaña todavía no tiene brief.</p>
          <button className="btn-red" onClick={editar}>Agregar brief</button>
        </div>
      )}

      {editando || guardado ? <p style={{ fontSize: 11.5, color: '#AAA', marginTop: 10 }}>Uso interno: el cliente no ve el brief.</p> : null}
    </div>
  )
}
