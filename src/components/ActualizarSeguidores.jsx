import { useState } from 'react'
import sql from '../lib/db'
import Modal from './Modal'
import { calcularCambios } from '../lib/seguidores'

// Botón del Roster: trae los seguidores de los reportes de Tokchart (últimos 120 días), muestra qué cambiaría
// y guarda solo si se confirma.

const fmt = n => {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'K'
  return String(n)
}

export default function ActualizarSeguidores({ influencers, onDone, isMobile }) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [res, setRes] = useState(null)   // { cambios, sinDatos }
  const [error, setError] = useState('')
  const [listo, setListo] = useState(0)

  async function revisar() {
    setAbierto(true); setCargando(true); setError(''); setRes(null); setListo(0)
    try {
      const datos = await sql`
        SELECT DISTINCT ON (plataforma, handle) plataforma, handle, followers, fetched_at FROM (
          SELECT m.plataforma, m.fetched_at, lower(x->>'handle') AS handle,
            CASE WHEN x->>'followers' ~ '^[0-9]+$' THEN (x->>'followers')::bigint END AS followers
          FROM (SELECT plataforma, fetched_at, posts FROM campaign_metrics
                UNION ALL SELECT plataforma, fetched_at, posts FROM sb_metricas) m
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.posts) = 'array' THEN m.posts ELSE '[]'::jsonb END) x
          WHERE m.fetched_at > now() - interval '120 days' AND coalesce(x->>'handle', '') <> ''
        ) p
        WHERE followers > 0
        ORDER BY plataforma, handle, fetched_at DESC`
      setRes(calcularCambios(influencers, datos))
    } catch (e) { setError(e.message) }
    setCargando(false)
  }

  async function guardar() {
    setGuardando(true); setError('')
    try {
      const c = res.cambios
      await sql`
        UPDATE influencers i SET
          tt_seguidores = COALESCE(v.tt, i.tt_seguidores),
          ig_seguidores = COALESCE(v.ig, i.ig_seguidores)
        FROM unnest(${c.map(x => String(x.id))}::text[], ${c.map(x => x.tt_seguidores?.ahora ?? null)}::bigint[], ${c.map(x => x.ig_seguidores?.ahora ?? null)}::bigint[]) AS v(id, tt, ig)
        WHERE i.id::text = v.id`
      setListo(c.length)
      onDone?.()
    } catch (e) { setError(e.message) }
    setGuardando(false)
  }

  const flecha = d => d && <span><span style={{ color: '#AAA' }}>{d.antes ? fmt(d.antes) : '—'}</span> → <b>{fmt(d.ahora)}</b></span>

  return (
    <>
      <button className="btn-ghost" onClick={revisar} style={{ fontSize: isMobile ? 13 : 14, padding: isMobile ? '7px 12px' : undefined }} title="Actualizar seguidores con los datos de Tokchart">
        ↻ Seguidores
      </button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Actualizar seguidores">
        {cargando && <div style={{ fontSize: 13, color: '#888' }}>Buscando los seguidores en los reportes de Tokchart…</div>}
        {error && <div style={{ fontSize: 12.5, color: '#A32D2D', background: '#FCEBEB', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>{error}</div>}
        {listo > 0 && <div style={{ fontSize: 13, color: '#085041', background: '#E1F5EE', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>Listo: se actualizaron {listo} influencers.</div>}
        {res && !listo && (
          <>
            <p style={{ fontSize: 12.5, color: '#666', lineHeight: 1.5, marginBottom: 12 }}>
              Se usan los seguidores que trae Tokchart en los reportes de campañas y de Social Boost de los últimos 4 meses (el dato más reciente de cada usuario).
            </p>
            {res.cambios.length === 0 ? (
              <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>No hay cambios: los seguidores ya están al día.</div>
            ) : (
              <div style={{ border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 8, padding: '8px 12px', background: '#F7F7F5', fontSize: 11, color: '#888' }}>
                  <span>Influencer</span><span>TikTok</span><span>Instagram</span>
                </div>
                {res.cambios.map(c => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 8, padding: '8px 12px', borderTop: '0.5px solid #F0F0EE', fontSize: 12.5 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                    <span>{flecha(c.tt_seguidores) || <span style={{ color: '#CCC' }}>sin cambio</span>}</span>
                    <span>{flecha(c.ig_seguidores) || <span style={{ color: '#CCC' }}>sin cambio</span>}</span>
                  </div>
                ))}
              </div>
            )}
            {res.sinDatos.length > 0 && (
              <details style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                <summary style={{ cursor: 'pointer' }}>{res.sinDatos.length} influencers sin datos recientes en Tokchart (no subieron videos a campañas con reporte)</summary>
                <div style={{ marginTop: 6, lineHeight: 1.6 }}>{res.sinDatos.join(', ')}</div>
              </details>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setAbierto(false)}>Cancelar</button>
              {res.cambios.length > 0 && (
                <button className="btn-red" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : `Guardar ${res.cambios.length} cambios`}</button>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
