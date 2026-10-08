import { useState, useEffect, useCallback } from 'react'

// Página privada de la editora: ve las canciones activas de la semana y agrega links.
// No usa login: se entra con el link secreto (?editor=...). No toca nada más de ROSTER.

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function mondayOf(s) { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d) }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
function tituloSemana(inicio) { const d = parseYmd(inicio); return `${MESES[d.getMonth()]} · Semana ${Math.ceil(d.getDate() / 7)}` }
function rangoSemana(inicio) {
  const a = parseYmd(inicio), b = parseYmd(addDays(inicio, 6))
  return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3).toLowerCase()}`
}
const hora = ts => new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const CHUNK = 10 // links por envío al servidor

export default function VistaEditor({ token }) {
  const [inicio, setInicio] = useState(mondayOf(ymd(new Date())))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [abierta, setAbierta] = useState(null) // cancion_id con el formulario abierto
  const [texto, setTexto] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [busy, setBusy] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [aviso, setAviso] = useState(null)

  async function api(body) {
    const r = await fetch('/api/editor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, inicio, ...body }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { status: r.status })
    return j
  }

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, inicio, action: 'state' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(r.status === 401 ? 'invalido' : 'error'); setLoading(false); return }
      setData(j); setError(null)
    } catch { setError('error') }
    setLoading(false)
  }, [token, inicio])
  useEffect(() => { setLoading(true); cargar() }, [cargar])

  async function agregar(cancionId) {
    const lineas = [...new Set(texto.split(/\s+/).map(s => s.trim()).filter(l => /^https?:\/\//i.test(l)))]
    if (!lineas.length) return setAviso({ tipo: 'error', txt: 'Pegá al menos un link (uno por línea).' })
    setBusy(true); setAviso(null)
    const tot = { nuevos: 0, repetidos: 0, sinConvertir: 0, sinUsuario: 0, ignorados: 0 }
    try {
      for (let i = 0; i < lineas.length; i += CHUNK) {
        setProgreso(`Procesando ${Math.min(i + CHUNK, lineas.length)} de ${lineas.length}…`)
        const r = await api({ action: 'add', cancion_id: cancionId, links: lineas.slice(i, i + CHUNK), cuenta_id: cuentaId || null })
        for (const k of Object.keys(tot)) tot[k] += r[k] || 0
      }
      const partes = [`${tot.nuevos} agregado${tot.nuevos === 1 ? '' : 's'}`]
      if (tot.repetidos) partes.push(`${tot.repetidos} repetido${tot.repetidos === 1 ? '' : 's'} (ya estaban)`)
      if (tot.sinConvertir) partes.push(`${tot.sinConvertir} no se pudieron convertir`)
      if (tot.sinUsuario) partes.push(`${tot.sinUsuario} sin usuario: elegí la cuenta y volvé a pegarlos`)
      if (tot.ignorados) partes.push(`${tot.ignorados} no eran de TikTok`)
      setAviso({ tipo: tot.sinConvertir || tot.sinUsuario ? 'warn' : 'ok', txt: partes.join(' · ') })
      setTexto('')
      await cargar()
    } catch (e) {
      setAviso({ tipo: 'error', txt: e.message || 'No se pudo guardar.' })
      await cargar()
    }
    setProgreso(''); setBusy(false)
  }

  async function borrar(v) {
    if (!confirm('¿Borrar este video?')) return
    try { await api({ action: 'delete', video_id: v.id }); await cargar() } catch (e) { alert(e.message) }
  }

  const esActual = inicio === mondayOf(ymd(new Date()))
  const wrap = { minHeight: '100vh', background: '#F7F7F5', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1A1A1A' }
  const card = { background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 14 }
  const ghost = { background: '#fff', border: '0.5px solid #D0D0CC', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#555', cursor: 'pointer', fontFamily: 'inherit' }
  const avisoColor = { ok: ['#EAF3DE', '#27500A'], warn: ['#FAEEDA', '#633806'], error: ['#FCEBEB', '#A32D2D'] }

  if (error === 'invalido') return (
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', color: '#AAA' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#555', marginBottom: 6 }}>Este link no es válido</div>
        <div style={{ fontSize: 13 }}>Pedí uno nuevo a tu agencia.</div>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ background: '#111', padding: '22px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 900, margin: '0 auto' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#E8313A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>K</div>
          <div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Social Boost</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#fff' }}>Subida de videos</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 500 }}>{tituloSemana(inicio)}</div>
            <div style={{ fontSize: 13, color: '#999' }}>{rangoSemana(inicio)}{esActual ? ' · en curso' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ghost} onClick={() => { setInicio(addDays(inicio, -7)); setAbierta(null); setAviso(null) }}>←</button>
            <button style={{ ...ghost, fontWeight: 500 }} onClick={() => { setInicio(mondayOf(ymd(new Date()))); setAbierta(null); setAviso(null) }}>Esta semana</button>
            <button style={ghost} onClick={() => { setInicio(addDays(inicio, 7)); setAbierta(null); setAviso(null) }}>→</button>
          </div>
        </div>

        {loading ? <div style={{ color: '#AAA', fontSize: 13 }}>Cargando…</div>
          : error ? <div style={{ ...card, padding: 24, textAlign: 'center', color: '#A32D2D', fontSize: 13 }}>No se pudo cargar. Probá recargar la página.</div>
          : data.slots.length === 0 ? <div style={{ ...card, padding: 36, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay canciones activas esta semana.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.slots.map(s => {
                const vids = data.videos.filter(v => v.cancion_id === s.cancion_id)
                const open = abierta === s.cancion_id
                return (
                  <div key={s.cancion_id} style={{ ...card, borderLeft: '3px solid #E8313A', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 500 }}>{s.cancion}</div>
                        <div style={{ fontSize: 12.5, color: '#999' }}>{s.artista || '—'} · {s.vids_sem} esta semana · {s.vids_mes} en el mes</div>
                      </div>
                      <button className="btn-red" style={{ fontSize: 13 }} onClick={() => { setAbierta(open ? null : s.cancion_id); setAviso(null); setTexto('') }}>
                        {open ? 'Cerrar' : '＋ Agregar links'}
                      </button>
                    </div>

                    {open && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid #F0F0EE' }}>
                        <label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '.07em' }}>Links de TikTok (uno por línea)</label>
                        <textarea className="input" rows={6} style={{ marginTop: 6 }} value={texto} disabled={busy}
                          onChange={e => setTexto(e.target.value)} placeholder={'https://vt.tiktok.com/…\nhttps://vt.tiktok.com/…'} />
                        <label style={{ display: 'block', fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '.07em', margin: '12px 0 6px' }}>Cuenta (solo si el link no muestra el usuario)</label>
                        <select className="input" value={cuentaId} disabled={busy} onChange={e => setCuentaId(e.target.value)}>
                          <option value="">Sin indicar</option>
                          {data.cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.handle ? ' · ' + c.handle : ''}</option>)}
                        </select>
                        <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 4 }}>Los links cortos se convierten solos y el usuario se detecta desde el link.</div>
                        {aviso && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 13, background: avisoColor[aviso.tipo][0], color: avisoColor[aviso.tipo][1] }}>{aviso.txt}</div>}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                          <button className="btn-red" disabled={busy} onClick={() => agregar(s.cancion_id)}>{busy ? 'Guardando…' : 'Guardar links'}</button>
                          {progreso && <span style={{ fontSize: 12, color: '#888' }}>{progreso}</span>}
                        </div>
                      </div>
                    )}

                    {vids.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 10.5, color: '#BBB', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Subidos esta semana ({vids.length})</div>
                        {vids.slice(0, open ? 100 : 5).map(v => (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '0.5px solid #F3F3F1', fontSize: 13 }}>
                            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.link_web
                                ? <a href={v.link_web} target="_blank" rel="noopener noreferrer" style={{ color: '#3B5BDB', textDecoration: 'none' }}>{v.handle ? '@' + v.handle : 'Ver video'}</a>
                                : <span style={{ color: '#C0392B' }}>sin convertir</span>}
                              <span style={{ color: '#BBB', fontSize: 11.5, marginLeft: 8 }}>{hora(v.created_at)}</span>
                            </div>
                            <button onClick={() => borrar(v)} title="Borrar" style={{ border: 'none', background: 'none', color: '#BBB', cursor: 'pointer', fontSize: 14 }}>✕</button>
                          </div>
                        ))}
                        {!open && vids.length > 5 && <div style={{ fontSize: 12, color: '#AAA', paddingTop: 6 }}>+ {vids.length - 5} más (abrí "Agregar links" para ver todos)</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
