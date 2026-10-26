import { useState, useEffect, useCallback } from 'react'
import supabase from '../lib/supabaseClient'
import sql from '../lib/db'
import useIsMobile from '../lib/useIsMobile'
import { TablaVideos } from './MetricasCampana'

// Social Boost → "Cuentas": cómo rinde cada cuenta de TikTok por mes o en el histórico.
// En Roster (admin) se ve todo y se controla qué ve el cliente; en el portal, solo lo visible.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const nombreMes = m => { const [y, mm] = m.split('-').map(Number); return `${MESES[mm - 1]} ${y}` }
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const fmt = n => {
  if (n == null) return '—'
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '').replace('.', ',') + 'M'
  if (n >= 1e4) return Math.round(n / 1e3) + 'K'
  return Math.round(n).toLocaleString('es-CL')
}
const pct = v => v == null ? '—' : Number(v).toFixed(2).replace('.', ',') + '%'
const card = { background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12 }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const COLS = [
  { k: 'nombre', label: 'Cuenta', val: c => c.nombre.toLowerCase(), texto: true },
  { k: 'videos', label: 'Videos', val: c => c.videos, ver: c => c.videos },
  { k: 'views', label: 'Views', val: c => c.conMetricas ? c.views : null, ver: c => c.conMetricas ? fmt(c.views) : '—' },
  { k: 'promedio', label: 'Promedio por video', val: c => c.promedio, ver: c => fmt(c.promedio) },
  { k: 'engagement', label: 'Engagement', val: c => c.engagement, ver: c => pct(c.engagement) },
  { k: 'likes', label: 'Likes', val: c => c.conMetricas ? c.likes : null, ver: c => c.conMetricas ? fmt(c.likes) : '—' },
  { k: 'shares', label: 'Compartidos', val: c => c.conMetricas ? c.shares : null, ver: c => c.conMetricas ? fmt(c.shares) : '—' },
]

function resumen(d) {
  const conDatos = d.cuentas.filter(c => c.conMetricas >= 2)
  if (!d.cuentas.length) return 'Todavía no hay videos en este período.'
  const partes = [`${d.periodo === 'todo' ? 'En total' : 'Este mes'} se subieron <b>${d.totalVideos} videos</b> entre <b>${d.cuentas.length} cuenta${d.cuentas.length === 1 ? '' : 's'}</b>.`]
  if (conDatos.length) {
    const prom = conDatos.reduce((a, c) => a + c.views, 0) / conDatos.reduce((a, c) => a + c.conMetricas, 0)
    const top = [...conDatos].sort((a, b) => b.promedio - a.promedio)[0]
    const veces = prom > 0 ? top.promedio / prom : 0
    partes.push(`La que mejor rinde es <b>${esc(top.nombre)}</b>: ${fmt(top.promedio)} views promedio por video${veces >= 1.2 ? ` (${veces.toFixed(1).replace('.', ',')}× el promedio)` : ''}.`)
    const masVideos = [...d.cuentas].sort((a, b) => b.videos - a.videos)[0]
    if (masVideos.clave !== top.clave) {
      partes.push(`<b>${esc(masVideos.nombre)}</b> es la que más subió (${masVideos.videos} videos)${masVideos.promedio != null && masVideos.promedio < prom * 0.6 ? `, pero su promedio es bajo (${fmt(masVideos.promedio)})` : ''}.`)
    }
  }
  if (d.conMetricas < d.totalVideos) partes.push(`<span style="color:#A19890">${d.conMetricas} de ${d.totalVideos} videos tienen métricas de Tokchart.</span>`)
  return partes.join(' ')
}

export default function SbCuentas({ admin = false }) {
  const isMobile = useIsMobile()
  const [mes, setMes] = useState(mesActual())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [orden, setOrden] = useState({ k: 'promedio', dir: 'desc' })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/sb-cuentas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(admin && session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ mes }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'No se pudo cargar')
      setData(j)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [mes, admin])
  useEffect(() => { cargar() }, [cargar])

  // ───── Controles de Roster: qué ve el cliente ─────
  async function cambiarPortal(valor) {
    setGuardando(true)
    try {
      await sql`INSERT INTO ajustes (clave, valor) VALUES ('sb_cuentas_portal', ${JSON.stringify(valor)}::jsonb) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`
      await cargar()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }
  async function cambiarVisible(cuentaId, valor) {
    setGuardando(true)
    try {
      await sql`UPDATE sb_cuentas SET visible_cliente = ${valor} WHERE id = ${cuentaId}`
      await cargar()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
    setGuardando(false)
  }

  if (!loading && !admin && data && !data.disponible) return null

  const vis = data?.visibilidad
  const visibleDe = id => vis?.cuentas.find(c => c.id === id)?.visible_cliente !== false
  const col = COLS.find(c => c.k === orden.k) || COLS[3]
  const cuentas = data?.cuentas ? [...data.cuentas].sort((a, b) => {
    const va = col.val(a), vb = col.val(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const r = col.texto ? String(va).localeCompare(String(vb)) : va - vb
    return orden.dir === 'asc' ? r : -r
  }) : []
  const ordenarPor = k => setOrden(o => o.k === k ? { k, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { k, dir: k === 'nombre' ? 'asc' : 'desc' })
  const sel = abierta && data?.cuentas.find(c => c.clave === abierta)

  const selector = (
    <select className="input" style={{ width: 'auto', minWidth: 170 }} value={mes} onChange={e => { setMes(e.target.value); setAbierta(null) }}>
      {[...new Set([mesActual(), ...(data?.meses || [])])].sort().reverse().map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
      <option value="todo">Histórico (todos los meses)</option>
    </select>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 600, letterSpacing: '-.02em' }}>Cuentas</div>
          <div style={{ fontSize: 12.5, color: '#999', marginTop: 2 }}>Cómo rinde cada cuenta de TikTok · {mes === 'todo' ? 'Histórico' : nombreMes(mes)}</div>
        </div>
        {selector}
      </div>

      {/* Controles (solo en Roster) */}
      {admin && vis && (
        <div style={{ ...card, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13 }}>
            <b>Portal del cliente:</b> {vis.portal ? 'el cliente ve esta pestaña (sin las cuentas que ocultes).' : 'esta pestaña está oculta para el cliente.'}
            {!vis.listo && <div style={{ fontSize: 11.5, color: '#A32D2D', marginTop: 2 }}>Falta crear la tabla de ajustes en Supabase para poder usar estos controles.</div>}
          </div>
          <button className={vis.portal ? 'btn-ghost' : 'btn-red'} style={{ fontSize: 12.5 }} disabled={guardando || !vis.listo} onClick={() => cambiarPortal(!vis.portal)}>
            {vis.portal ? 'Ocultar al cliente' : 'Mostrar al cliente'}
          </button>
        </div>
      )}

      {loading ? <div style={{ color: '#AAA', fontSize: 13 }}>Cargando cuentas…</div>
        : error ? <div style={{ ...card, padding: 18, color: '#A32D2D', fontSize: 13 }}>{error}</div>
        : sel ? (
          // ───── Detalle de una cuenta ─────
          <div>
            <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 12 }} onClick={() => setAbierta(null)}>← Todas las cuentas</button>
            <div style={{ ...card, padding: 16, marginBottom: 12, borderTop: '3px solid #C4501A' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>{sel.nombre}</div>
                  {sel.handle && <a href={`https://www.tiktok.com/@${sel.handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: '#C4501A', textDecoration: 'none' }}>@{sel.handle} ↗</a>}
                </div>
                {admin && sel.cuenta_id && vis?.listo && (
                  <button className="btn-ghost" style={{ fontSize: 12 }} disabled={guardando} onClick={() => cambiarVisible(sel.cuenta_id, !visibleDe(sel.cuenta_id))}>
                    {visibleDe(sel.cuenta_id) ? '👁 Visible para el cliente' : '🚫 Oculta para el cliente'}
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 12, marginTop: 14 }}>
                {[['Videos', sel.videos], ['Views', sel.conMetricas ? fmt(sel.views) : '—'], ['Promedio por video', fmt(sel.promedio)], ['Engagement', pct(sel.engagement)], ['Compartidos', sel.conMetricas ? fmt(sel.shares) : '—']].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>{l}</div><div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em' }}>{v}</div></div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 8px' }}>Por canción</div>
            <div style={{ ...card, marginBottom: 14 }}>
              {sel.canciones.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderBottom: i < sel.canciones.length - 1 ? '0.5px solid #F0F0EE' : 'none', fontSize: 13 }}>
                  <div style={{ minWidth: 0 }}><b style={{ fontWeight: 500 }}>{c.cancion}</b>{c.artista && <span style={{ color: '#AAA' }}> · {c.artista}</span>}</div>
                  <div style={{ flexShrink: 0, color: '#555' }}>{c.videos} video{c.videos === 1 ? '' : 's'} · <b>{fmt(c.views)}</b> views</div>
                </div>
              ))}
            </div>

            <TablaVideos posts={sel.lista} isMobile={isMobile} />
            {sel.conMetricas < sel.videos && <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 8 }}>{sel.videos - sel.conMetricas} video{sel.videos - sel.conMetricas === 1 ? '' : 's'} todavía sin métricas de Tokchart (aparecen al final).</div>}
          </div>
        ) : (
          // ───── Todas las cuentas ─────
          <div>
            <div style={{ ...card, padding: '14px 16px', marginBottom: 14, fontSize: 14, lineHeight: 1.55, borderLeft: '3px solid #C4501A' }} dangerouslySetInnerHTML={{ __html: resumen(data) }} />
            {!cuentas.length ? null : isMobile ? (
              <>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#AAA' }}>Ordenar por</span>
                  <select className="input" style={{ width: 'auto', padding: '6px 8px', fontSize: 12.5 }} value={orden.k} onChange={e => setOrden({ k: e.target.value, dir: e.target.value === 'nombre' ? 'asc' : 'desc' })}>
                    {COLS.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
                  </select>
                  <button className="btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setOrden(o => ({ ...o, dir: o.dir === 'desc' ? 'asc' : 'desc' }))}>{orden.dir === 'desc' ? '↓' : '↑'}</button>
                </div>
                <div style={card}>
                  {cuentas.map((c, i) => (
                    <div key={c.clave} onClick={() => setAbierta(c.clave)} style={{ padding: '12px 14px', borderBottom: i < cuentas.length - 1 ? '0.5px solid #F0F0EE' : 'none', cursor: 'pointer', opacity: admin && c.cuenta_id && !visibleDe(c.cuenta_id) ? 0.55 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{i === 0 && orden.k === 'promedio' && orden.dir === 'desc' && c.promedio != null && <span style={{ fontSize: 10, color: '#fff', background: '#C4501A', borderRadius: 5, padding: '1px 6px', marginRight: 6 }}>Top</span>}{c.nombre}{admin && c.cuenta_id && !visibleDe(c.cuenta_id) && <span style={{ fontSize: 11, color: '#AAA' }}> · oculta</span>}</div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(c.promedio)} <span style={{ fontSize: 10, color: '#AAA', fontWeight: 400 }}>prom.</span></div>
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{c.videos} videos · {c.conMetricas ? fmt(c.views) : '—'} views · eng. {pct(c.engagement)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ ...card, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680, fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                      {COLS.map(c => (
                        <th key={c.k} className="th" onClick={() => ordenarPor(c.k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0, fontSize: 11.5, padding: '10px 8px', textAlign: c.k === 'nombre' ? 'left' : 'right', color: orden.k === c.k ? '#C4501A' : undefined }}>
                          {c.label}{orden.k === c.k ? (orden.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                        </th>
                      ))}
                      <th className="th" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11.5, padding: '10px 8px', whiteSpace: 'nowrap' }}>Mejor video</th>
                      {admin && <th className="th" style={{ textAlign: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 11.5, padding: '10px 8px' }}>Cliente</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((c, i) => {
                      const oculta = admin && c.cuenta_id && !visibleDe(c.cuenta_id)
                      return (
                        <tr key={c.clave} style={{ borderBottom: '0.5px solid #F0F0EE', cursor: 'pointer', opacity: oculta ? 0.55 : 1 }} onClick={() => setAbierta(c.clave)}>
                          {COLS.map(col => col.k === 'nombre' ? (
                            <td key={col.k} className="td" style={{ fontWeight: 500, whiteSpace: 'nowrap', padding: '11px 8px 11px 14px' }}>
                              {i === 0 && orden.k === 'promedio' && orden.dir === 'desc' && c.promedio != null && <span style={{ fontSize: 10, color: '#fff', background: '#C4501A', borderRadius: 5, padding: '1px 6px', marginRight: 6 }}>Top</span>}
                              {c.nombre}{oculta && <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400 }}> · oculta</span>}
                            </td>
                          ) : (
                            <td key={col.k} className="td" style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '11px 8px', fontWeight: orden.k === col.k ? 600 : 400 }}>{col.ver(c)}</td>
                          ))}
                          <td className="td" onClick={e => e.stopPropagation()}>{c.mejor?.link ? <a href={c.mejor.link} target="_blank" rel="noopener noreferrer" style={{ color: '#C4501A', textDecoration: 'none', whiteSpace: 'nowrap' }}>{fmt(c.mejor.views)} views ↗</a> : '—'}</td>
                          {admin && (
                            <td className="td" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                              {c.cuenta_id && vis?.listo
                                ? <button className="btn-icon" title={oculta ? 'Mostrar al cliente' : 'Ocultar al cliente'} disabled={guardando} onClick={() => cambiarVisible(c.cuenta_id, !visibleDe(c.cuenta_id))}>{oculta ? '🚫' : '👁'}</button>
                                : <span style={{ color: '#CCC' }}>—</span>}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
    </div>
  )
}
