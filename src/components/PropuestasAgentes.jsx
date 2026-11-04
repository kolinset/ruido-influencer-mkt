import { useEffect, useState } from 'react'
import sql from '../lib/db'
import supabase from '../lib/supabaseClient'
import { tokchartCall } from '../lib/links'

// Propuestas del agente de Influencers que esperan aprobación.
// El agente nunca cambia nada solo: propone, y aquí Lucas/Nico aprueban o rechazan.
// Al aprobar, api/propuestas.js aplica el cambio (en una transacción) con tu sesión.
// Si no hay pendientes (o el parche SQL aún no se ejecutó), no se muestra nada.

const ICONO = { crear_campana: '🆕', lista_influencers: '👥', actualizar_influencer: '✏️', agregar_links: '🔗', cambiar_estado: '🏁' }

function hace(f) {
  const min = Math.floor((Date.now() - new Date(f).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 1440) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 1440)} d`
}

export default function PropuestasAgentes({ onCambio }) {
  const [lista, setLista] = useState([])
  const [busy, setBusy] = useState(null)
  const [aviso, setAviso] = useState(null)

  async function cargar() {
    try {
      setLista(await sql`SELECT id, created_at, agente, tipo, resumen, motivo, datos, campaign_id FROM propuestas_agentes WHERE estado = 'pendiente' ORDER BY created_at ASC`)
    } catch { setLista([]) }
  }
  useEffect(() => { cargar(); const t = setInterval(cargar, 60000); return () => clearInterval(t) }, [])

  async function resolver(p, aprobar) {
    setBusy(p.id); setAviso(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/propuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ id: p.id, aprobar }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r.error || r.mensaje || 'No se pudo')
      // Igual que al guardar a mano: si la campaña tiene reporte en Tokchart, se le mandan los links nuevos
      for (const plataforma of r.sync || []) {
        const t = await tokchartCall({ action: 'sync', campaign_id: r.campaign_id, plataforma }).catch(() => null)
        if (t && !t.ok && !t.sinReporte) setAviso({ tipo: 'warn', txt: `Aprobado, pero no se pudo enviar a Tokchart (${t.message || t.error || 'error'}). Reintenta desde la campaña con "Enviar links a Tokchart".` })
      }
      setAviso(a => a || { tipo: 'ok', txt: aprobar ? `✓ ${r.mensaje || 'Aprobada'}` : 'Propuesta rechazada' })
      onCambio?.()
    } catch (e) {
      setAviso({ tipo: 'error', txt: 'No se pudo: ' + e.message })
    }
    setBusy(null)
    cargar()
  }

  if (!lista.length && !aviso) return null

  const color = { ok: '#27500A', warn: '#633806', error: '#791F1F' }
  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderLeft: '3px solid #C4501A', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: lista.length ? 12 : 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>🤖 Propuestas de los agentes</div>
        <div style={{ fontSize: 12, color: '#888' }}>{lista.length ? `${lista.length} esperando tu aprobación` : ''}</div>
      </div>
      {aviso && <div style={{ fontSize: 12, color: color[aviso.tipo], marginBottom: lista.length ? 10 : 0 }}>{aviso.txt}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lista.map(p => {
          const d = typeof p.datos === 'string' ? JSON.parse(p.datos) : (p.datos || {})
          return (
            <div key={p.id} style={{ background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{ICONO[p.tipo] || '•'} {p.resumen}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.agente} · {hace(p.created_at)}{p.motivo ? ` · ${p.motivo}` : ''}</div>
                {(d.vista || []).length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: '#555', lineHeight: 1.5 }}>
                    {d.vista.slice(0, 12).map((v, i) => <li key={i} style={{ wordBreak: 'break-word', color: v.startsWith('⚠') ? '#854F0B' : undefined }}>{v}</li>)}
                    {d.vista.length > 12 && <li>… y {d.vista.length - 12} más</li>}
                  </ul>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button disabled={busy === p.id} onClick={() => resolver(p, true)}
                  style={{ background: '#C4501A', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: busy === p.id ? .5 : 1 }}>
                  {busy === p.id ? '…' : 'Aprobar'}
                </button>
                <button disabled={busy === p.id} onClick={() => resolver(p, false)}
                  style={{ background: 'transparent', color: '#888', border: '0.5px solid #DDD', borderRadius: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}>
                  Rechazar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
