import { useState, useEffect, useCallback } from 'react'
import sql from '../lib/db'
import Modal from './Modal'
import { convertMany, isMobileTikTok } from '../lib/links'

// ───────── fechas (siempre texto YYYY-MM-DD, sin husos horarios) ─────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const firstOfMonth = s => s.slice(0, 7) + '-01'
function mondayOf(s) { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d) }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
function tituloSemana(inicio) {
  const d = parseYmd(inicio)
  return `${MESES[d.getMonth()]} · Semana ${Math.ceil(d.getDate() / 7)}`
}
function rangoSemana(inicio) {
  const a = parseYmd(inicio), b = parseYmd(addDays(inicio, 6))
  return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3).toLowerCase()}`
}
function fechaHora(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function parseVideo(link) {
  const m = (link || '').match(/tiktok\.com\/@([^/?#]+)\/(?:video|photo)\/(\d+)/)
  return m ? { handle: m[1], video_id: m[2] } : { handle: '', video_id: '' }
}

const MAX_MES = 120

// Quién del equipo del cliente pidió la canción (mismos nombres que en Campañas)
const SOLICITANTES = ['Valeria Moraga', 'Gabriela Albarracín', 'Dominique De Solminihac', 'Juan Pablo Jiménez']
const primerNombre = n => (n || '').split(' ')[0]

// (La "cuenta efectiva" de un video = la asignada a mano o la que coincide con el usuario del link; se calcula en SQL.)

// ═════════════════════════ DASHBOARD ═════════════════════════
export default function SocialBoost() {
  const [inicio, setInicio] = useState(mondayOf(ymd(new Date())))
  const [vista, setVista] = useState('dashboard') // dashboard | config | cancion
  const [cancionSel, setCancionSel] = useState(null) // slot abierto
  const [cuentas, setCuentas] = useState([])
  const [semana, setSemana] = useState(null)
  const [slots, setSlots] = useState([])
  const [prevSlots, setPrevSlots] = useState([])
  const [ultimos, setUltimos] = useState([])
  const [kpi, setKpi] = useState({ mes: 0, semana: 0 })
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalSlot, setModalSlot] = useState(null) // número de slot a llenar
  const [form, setForm] = useState({ cancion: '', artista: '', tokchart_url: '', solicitante: '' })

  const mesSemana = firstOfMonth(inicio)
  const prevInicio = addDays(inicio, -7)
  const esActual = inicio === mondayOf(ymd(new Date()))

  const SLOT_SQL = (semId) => sql`
    SELECT ss.id AS ss_id, ss.slot, ss.cuenta_id, c.id AS cancion_id, c.cancion, c.artista, c.tokchart_url, c.notas, c.solicitante, c.mes::text AS mes,
      (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id AND v.semana_id = ss.semana_id)::int AS vids_sem,
      (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id)::int AS vids_mes
    FROM sb_semana_slots ss JOIN sb_canciones c ON c.id = ss.cancion_id
    WHERE ss.semana_id = ${semId} ORDER BY ss.slot`

  const cargar = useCallback(async () => {
    try {
      const cu = await sql`SELECT id, nombre, handle, notas, activa FROM sb_cuentas ORDER BY nombre`
      setCuentas(cu)
      const sem = (await sql`SELECT id, inicio::text AS inicio, mes::text AS mes FROM sb_semanas WHERE inicio = ${inicio}`)[0] || null
      setSemana(sem)
      setSlots(sem ? await SLOT_SQL(sem.id) : [])
      const prev = (await sql`SELECT id FROM sb_semanas WHERE inicio = ${prevInicio}`)[0]
      setPrevSlots(prev ? await SLOT_SQL(prev.id) : [])
      const kMes = await sql`SELECT count(*)::int AS n FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id WHERE c.mes = ${mesSemana}`
      const kSem = sem ? await sql`SELECT count(*)::int AS n FROM sb_videos WHERE semana_id = ${sem.id}` : [{ n: 0 }]
      setKpi({ mes: kMes[0].n, semana: kSem[0].n })
      setUltimos(await sql`SELECT v.id, v.link_web, v.link_original, v.handle, v.created_at, c.id AS cancion_id, c.cancion, cu.nombre AS cuenta_nombre
        FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
        ORDER BY v.created_at DESC LIMIT 40`)
    } catch (e) { console.error(e); alert('Error cargando Social Boost: ' + e.message) }
    setLoading(false)
  }, [inicio])

  useEffect(() => { setLoading(true); cargar() }, [cargar])

  async function asegurarSemana() {
    if (semana) return semana.id
    await sql`INSERT INTO sb_semanas (mes, inicio) VALUES (${mesSemana}, ${inicio}) ON CONFLICT (inicio) DO NOTHING`
    const r = await sql`SELECT id FROM sb_semanas WHERE inicio = ${inicio}`
    return r[0].id
  }

  function slotLibre(extra = []) {
    const ocupados = new Set([...slots.map(s => s.slot), ...extra])
    return [1, 2, 3, 4, 5].find(n => !ocupados.has(n))
  }

  async function guardarNueva() {
    if (!form.cancion.trim()) return alert('Falta el nombre de la canción')
    try {
      const semId = await asegurarSemana()
      const c = await sql`INSERT INTO sb_canciones (mes, artista, cancion, tokchart_url, solicitante) VALUES (${mesSemana}, ${form.artista}, ${form.cancion.trim()}, ${form.tokchart_url.trim()}, ${form.solicitante}) RETURNING id`
      await sql`INSERT INTO sb_semana_slots (semana_id, slot, cancion_id) VALUES (${semId}, ${modalSlot}, ${c[0].id})`
      setModalSlot(null); cargar()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
  }

  // Copia canciones de la semana pasada a esta (los slots libres)
  async function copiar(lista, slotPreferido) {
    try {
      const semId = await asegurarSemana()
      const usados = new Set(slots.map(s => s.slot))
      const nombres = new Set(slots.map(s => `${s.cancion}|${s.artista}`))
      let copiadas = 0
      for (const p of lista) {
        if (nombres.has(`${p.cancion}|${p.artista}`)) continue
        let slot = slotPreferido && !usados.has(slotPreferido) ? slotPreferido : [1, 2, 3, 4, 5].find(n => !usados.has(n))
        if (!slot) break
        let cancionId = p.cancion_id
        if (p.mes !== mesSemana) {
          // Cambió el mes: ficha nueva (el Tokchart es mensual)
          const c = await sql`INSERT INTO sb_canciones (mes, artista, cancion, tokchart_url, solicitante) VALUES (${mesSemana}, ${p.artista}, ${p.cancion}, '', ${p.solicitante || ''}) RETURNING id`
          cancionId = c[0].id
        }
        await sql`INSERT INTO sb_semana_slots (semana_id, slot, cancion_id) VALUES (${semId}, ${slot}, ${cancionId})`
        usados.add(slot); copiadas++
        slotPreferido = null
      }
      if (!copiadas) alert('No había nada nuevo para copiar (o no quedan slots libres).')
      cargar()
    } catch (e) { alert('No se pudo copiar: ' + e.message) }
  }

  const sel = cancionSel != null ? slots.find(s => s.slot === cancionSel) : null
  const disponiblesPrev = prevSlots.filter(p => !slots.some(s => `${s.cancion}|${s.artista}` === `${p.cancion}|${p.artista}`))
  const ultimosVis = (filtro ? ultimos.filter(u => u.cancion_id === filtro) : ultimos).slice(0, 15)

  if (vista === 'cancion' && sel) {
    return <CancionPage slot={sel} semanaId={semana?.id} inicio={inicio} cuentas={cuentas}
      onBack={() => { setVista('dashboard'); cargar() }} onChanged={cargar} />
  }
  if (vista === 'config') {
    return <Config cuentas={cuentas} onBack={() => { setVista('dashboard'); cargar() }} onChanged={cargar} />
  }

  return (
    <div style={{ padding: '28px 28px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-.01em' }}>{tituloSemana(inicio)}</h1>
          <div style={{ fontSize: 12.5, color: '#999', marginTop: 4 }}>{rangoSemana(inicio)}{esActual ? ' · en curso' : ''}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-ghost" onClick={() => setInicio(addDays(inicio, -7))}>←</button>
            <button className="btn-ghost" style={{ fontWeight: 500 }} onClick={() => setInicio(mondayOf(ymd(new Date())))}>Esta semana</button>
            <button className="btn-ghost" onClick={() => setInicio(addDays(inicio, 7))}>→</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div className="card" style={{ padding: '12px 14px', width: 320, maxWidth: '100%' }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: '#AAA', marginBottom: 8 }}>Semana anterior · canciones usadas</div>
            {prevSlots.length === 0 ? <div style={{ fontSize: 12, color: '#BBB' }}>Sin datos</div> : (
              <div>
                {prevSlots.map(p => (
                  <span key={p.ss_id} style={{ display: 'inline-block', background: '#F1EFE8', borderRadius: 6, padding: '3px 8px', fontSize: 11.5, margin: '0 4px 4px 0', color: '#444' }}>
                    {p.cancion} <span style={{ color: '#999' }}>{p.vids_sem}</span>
                  </span>
                ))}
                {disponiblesPrev.length > 0 && slotLibre() && (
                  <div><button className="btn-ghost" style={{ fontSize: 11.5, padding: '4px 10px', marginTop: 4 }} onClick={() => copiar(disponiblesPrev)}>Copiar todas a esta semana</button></div>
                )}
              </div>
            )}
          </div>
          <button className="btn-ghost" title="Configuración" style={{ width: 36, height: 36, padding: 0, fontSize: 16 }} onClick={() => setVista('config')}>⚙</button>
        </div>
      </div>

      {loading ? <div style={{ color: '#AAA', fontSize: 13 }}>Cargando…</div> : (
        <>
          {/* Números rápidos */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {[[`${kpi.mes}`, `/ ${MAX_MES}`, 'videos en el mes'], [`${kpi.semana}`, '', 'videos esta semana'], [`${slots.length}`, '/ 5', 'slots ocupados']].map(([n, de, l]) => (
              <div key={l} className="card" style={{ padding: '10px 16px', minWidth: 150 }}>
                <div style={{ fontSize: 20, fontWeight: 500 }}>{n}<span style={{ fontSize: 13, color: '#999', fontWeight: 400 }}> {de}</span></div>
                <div style={{ fontSize: 11, color: '#999' }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Los 5 slots */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[1, 2, 3, 4, 5].map(n => {
              const s = slots.find(x => x.slot === n)
              if (!s) {
                return (
                  <div key={n} className="card" style={{ borderStyle: 'dashed', background: 'transparent', minHeight: 300, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#AAA' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>Slot {n}</div>
                    <button className="btn-ghost" onClick={() => { setForm({ cancion: '', artista: '', tokchart_url: '', solicitante: '' }); setModalSlot(n) }}>＋ Agregar canción</button>
                    {disponiblesPrev.length > 0 && (
                      <select className="input" style={{ fontSize: 12, maxWidth: 170 }} value=""
                        onChange={e => { const p = prevSlots.find(x => x.cancion_id === e.target.value); if (p) copiar([p], n) }}>
                        <option value="">Copiar de la semana pasada…</option>
                        {disponiblesPrev.map(p => <option key={p.cancion_id} value={p.cancion_id}>{p.cancion}</option>)}
                      </select>
                    )}
                  </div>
                )
              }
              const pct = Math.min(100, Math.round((s.vids_mes / 24) * 100))
              return (
                <div key={n} className="card" onClick={() => { setCancionSel(n); setVista('cancion') }}
                  style={{ borderTop: '3px solid #E8313A', cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 300, transition: 'box-shadow .12s' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                  <div style={{ padding: '14px 14px 10px' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#E8313A', fontWeight: 600 }}>Slot {n}</div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4, lineHeight: 1.25 }}>{s.cancion}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{s.artista || '—'}</div>
                    {s.solicitante && <div style={{ display: 'inline-block', marginTop: 8, fontSize: 11, background: '#F1EFE8', color: '#5F5E5A', borderRadius: 6, padding: '2px 8px' }}>Pidió {primerNombre(s.solicitante)}</div>}
                  </div>
                  <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-.02em' }}>{s.vids_sem}</div>
                    <div style={{ fontSize: 11.5, color: '#999' }}>videos esta semana</div>
                  </div>
                  <div style={{ padding: '0 14px 10px', fontSize: 12, color: '#888' }}>{s.vids_mes} en el mes</div>
                  <div style={{ margin: '0 14px 12px', height: 5, background: '#F0F0EE', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: '#E8313A' }} />
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px' }} onClick={e => e.stopPropagation()}>
                    <button className="btn-red" style={{ flex: 1, justifyContent: 'center', fontSize: 12.5 }} onClick={() => { setCancionSel(n); setVista('cancion') }}>＋ Agregar videos</button>
                    {s.tokchart_url
                      ? <a href={s.tokchart_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ textDecoration: 'none', fontSize: 12.5, padding: '8px 10px' }}>Tokchart ↗</a>
                      : <span className="btn-ghost" style={{ fontSize: 11.5, padding: '8px 10px', color: '#C0392B', cursor: 'default' }}>sin Tokchart</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Últimos videos */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderBottom: '0.5px solid #F0F0EE' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Últimos videos subidos</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="input" style={{ width: 'auto', fontSize: 12.5 }} value={filtro} onChange={e => setFiltro(e.target.value)}>
                  <option value="">Todas las canciones</option>
                  {[...new Map(ultimos.map(u => [u.cancion_id, u.cancion]))].map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                </select>
                <button className="btn-ghost" style={{ fontSize: 12.5 }} onClick={() => {
                  const links = ultimosVis.map(u => u.link_web || u.link_original).filter(Boolean)
                  if (!links.length) return alert('No hay links.')
                  navigator.clipboard.writeText(links.join('\n')).then(() => alert(`${links.length} links copiados`)).catch(() => prompt('Copiá:', links.join('\n')))
                }}>Copiar links</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {ultimosVis.length === 0 ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay videos subidos.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead><tr style={{ background: '#F7F7F5' }}>
                    <th className="th">Canción</th><th className="th">Usuario</th><th className="th">Link</th><th className="th">Subido</th>
                  </tr></thead>
                  <tbody>
                    {ultimosVis.map(u => (
                      <tr key={u.id} style={{ borderTop: '0.5px solid #F3F3F1' }}>
                        <td className="td">{u.cancion}</td>
                        <td className="td">{u.handle ? '@' + u.handle : (u.cuenta_nombre || '—')}</td>
                        <td className="td" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.link_web ? <a href={u.link_web} target="_blank" rel="noreferrer" style={{ color: '#3B5BDB' }}>{u.link_web.replace('https://www.', '')}</a> : <span style={{ color: '#C0392B' }}>sin convertir</span>}
                        </td>
                        <td className="td" style={{ color: '#999' }}>{fechaHora(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      <Modal open={modalSlot != null} onClose={() => setModalSlot(null)} title={`Nueva canción · Slot ${modalSlot}`}>
        <div className="fg"><label className="label">Canción</label>
          <input className="input" value={form.cancion} onChange={e => setForm(f => ({ ...f, cancion: e.target.value }))} /></div>
        <div className="fg"><label className="label">Artista</label>
          <input className="input" value={form.artista} onChange={e => setForm(f => ({ ...f, artista: e.target.value }))} /></div>
        <div className="fg"><label className="label">Link Tokchart (de este mes)</label>
          <input className="input" value={form.tokchart_url} onChange={e => setForm(f => ({ ...f, tokchart_url: e.target.value }))} placeholder="https://…" /></div>
        <div className="fg"><label className="label">Solicitada por</label>
          <select className="input" value={form.solicitante} onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))}>
            <option value="">Sin indicar</option>
            {SOLICITANTES.map(n => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModalSlot(null)}>Cancelar</button>
          <button className="btn-red" onClick={guardarNueva}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}

// ═════════════════════════ DESGLOSE DE UNA CANCIÓN ═════════════════════════
function CancionPage({ slot, semanaId, inicio, cuentas, onBack, onChanged }) {
  const [info, setInfo] = useState(slot)
  const [videos, setVideos] = useState([])
  const [modalAdd, setModalAdd] = useState(false)
  const [modalEdit, setModalEdit] = useState(false)
  const [texto, setTexto] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [formEdit, setFormEdit] = useState({})
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setVideos(await sql`SELECT v.id, v.link_original, v.link_web, v.handle, v.cuenta_id AS cuenta_manual, cu.id AS cuenta_id, v.created_at, s.inicio::text AS semana_inicio, cu.nombre AS cuenta_nombre
        FROM sb_videos v LEFT JOIN sb_semanas s ON s.id = v.semana_id LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
        WHERE v.cancion_id = ${slot.cancion_id} ORDER BY v.created_at DESC, v.id`)
    } catch (e) { console.error(e) }
  }, [slot.cancion_id])
  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    const lineas = [...new Set(texto.split(/\s+/).map(s => s.trim()).filter(l => /^https?:\/\//i.test(l)))]
    if (!lineas.length) return alert('Pegá al menos un link (uno por línea).')
    setBusy(true)
    try {
      let semId = semanaId
      if (!semId) {
        const r = await sql`SELECT id FROM sb_semanas WHERE inicio = ${inicio}`
        semId = r[0]?.id || null
      }
      const conv = await convertMany(lineas)
      let nuevos = 0, repetidos = 0, sinConvertir = 0, sinUsuario = 0
      for (let i = 0; i < lineas.length; i++) {
        const web = conv[i].error ? '' : conv[i].url
        if (conv[i].error) sinConvertir++
        const { handle, video_id } = parseVideo(web)
        // La cuenta solo se guarda cuando el link no trae usuario
        const cuenta = handle ? null : (cuentaId || null)
        if (!handle && !cuenta) sinUsuario++
        const r = await sql`INSERT INTO sb_videos (cancion_id, semana_id, cuenta_id, link_original, link_web, handle, video_id)
          VALUES (${slot.cancion_id}, ${semId}, ${cuenta}, ${lineas[i]}, ${web}, ${handle}, ${video_id})
          ON CONFLICT DO NOTHING RETURNING id`
        if (r.length) nuevos++; else repetidos++
      }
      setModalAdd(false); setTexto('')
      await cargar(); onChanged()
      alert(`Agregados: ${nuevos}` + (repetidos ? `\nRepetidos (ignorados): ${repetidos}` : '')
        + (sinConvertir ? `\nSin convertir: ${sinConvertir} (usá "Reintentar conversión")` : '')
        + (sinUsuario ? `\nSin usuario ni cuenta: ${sinUsuario} (elegí la cuenta en la lista)` : ''))
    } catch (e) { alert('Error: ' + e.message) }
    setBusy(false)
  }

  async function reintentar() {
    const pend = videos.filter(v => !v.link_web || isMobileTikTok(v.link_web))
    if (!pend.length) return alert('No hay videos pendientes de conversión.')
    setBusy(true)
    try {
      const conv = await convertMany(pend.map(v => v.link_original))
      let ok = 0
      for (let i = 0; i < pend.length; i++) {
        if (conv[i].error) continue
        const { handle, video_id } = parseVideo(conv[i].url)
        try { await sql`UPDATE sb_videos SET link_web=${conv[i].url}, handle=${handle}, video_id=${video_id} WHERE id=${pend[i].id}`; ok++ } catch (e) { /* duplicado */ }
      }
      await cargar(); onChanged()
      alert(`Convertidos: ${ok} de ${pend.length}`)
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  async function asignarCuenta(v, id) {
    try { await sql`UPDATE sb_videos SET cuenta_id = ${id || null} WHERE id = ${v.id}`; cargar() } catch (e) { alert(e.message) }
  }
  async function borrar(v) {
    if (!confirm('¿Quitar este video?')) return
    try { await sql`DELETE FROM sb_videos WHERE id = ${v.id}`; await cargar(); onChanged() } catch (e) { alert(e.message) }
  }

  function copiarTodos() {
    const links = videos.map(v => v.link_web || v.link_original).filter(Boolean)
    if (!links.length) return alert('No hay links.')
    navigator.clipboard.writeText(links.join('\n')).then(() => alert(`${links.length} links copiados`)).catch(() => prompt('Copiá:', links.join('\n')))
  }

  function abrirEditar() {
    setFormEdit({ cancion: info.cancion, artista: info.artista || '', tokchart_url: info.tokchart_url || '', notas: info.notas || '', solicitante: info.solicitante || '' })
    setModalEdit(true)
  }
  async function guardarEditar() {
    if (!formEdit.cancion.trim()) return alert('Falta el nombre')
    try {
      await sql`UPDATE sb_canciones SET cancion=${formEdit.cancion.trim()}, artista=${formEdit.artista}, tokchart_url=${formEdit.tokchart_url.trim()}, notas=${formEdit.notas}, solicitante=${formEdit.solicitante || ''} WHERE id=${slot.cancion_id}`
      setInfo(i => ({ ...i, ...formEdit }))
      setModalEdit(false); onChanged()
    } catch (e) { alert(e.message) }
  }
  async function quitarDeSemana() {
    if (!confirm('¿Quitar esta canción de la semana? Sus videos quedan guardados.')) return
    try { await sql`DELETE FROM sb_semana_slots WHERE id = ${slot.ss_id}`; onBack() } catch (e) { alert(e.message) }
  }

  const pendientes = videos.filter(v => !v.link_web || isMobileTikTok(v.link_web)).length
  const deSemana = videos.filter(v => v.semana_inicio === inicio).length

  return (
    <div style={{ padding: '28px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 14 }} onClick={onBack}>← {tituloSemana(inicio)}</button>

      <div className="card" style={{ padding: 18, marginBottom: 14, borderTop: '3px solid #E8313A' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#E8313A', fontWeight: 600 }}>Slot {info.slot}</div>
            <div style={{ fontSize: 20, fontWeight: 500, marginTop: 2 }}>{info.cancion}</div>
            <div style={{ fontSize: 12.5, color: '#888' }}>{info.artista || '—'}{info.solicitante ? ` · Solicitada por ${info.solicitante}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {info.tokchart_url
              ? <a href={info.tokchart_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ textDecoration: 'none' }}>Reporte Tokchart ↗</a>
              : <span style={{ fontSize: 12, color: '#C0392B', alignSelf: 'center' }}>Falta el link de Tokchart</span>}
            <button className="btn-ghost" onClick={abrirEditar}>Editar</button>
            <button className="btn-ghost" onClick={quitarDeSemana}>Quitar de la semana</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
          <div><div style={{ fontSize: 22, fontWeight: 500 }}>{deSemana}</div><div style={{ fontSize: 11, color: '#999' }}>esta semana</div></div>
          <div><div style={{ fontSize: 22, fontWeight: 500 }}>{videos.length}</div><div style={{ fontSize: 11, color: '#999' }}>en el mes</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Videos</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pendientes > 0 && <button className="btn-ghost" style={{ fontSize: 12 }} disabled={busy} onClick={reintentar}>{busy ? 'Convirtiendo…' : `Reintentar conversión (${pendientes})`}</button>}
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={copiarTodos}>Copiar todos los links</button>
          <button className="btn-red" style={{ fontSize: 12 }} onClick={() => setModalAdd(true)}>＋ Agregar videos</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {videos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay videos para esta canción.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead><tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
              <th className="th">#</th><th className="th">Semana</th><th className="th">Usuario</th><th className="th">Link</th><th className="th">Subido</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                  <td className="td" style={{ color: '#AAA' }}>{videos.length - i}</td>
                  <td className="td" style={{ color: '#888' }}>{v.semana_inicio ? rangoSemana(v.semana_inicio) : '—'}</td>
                  <td className="td">
                    {v.handle ? (
                      <span>@{v.handle}{v.cuenta_nombre && <span style={{ marginLeft: 6, fontSize: 11, background: '#F1EFE8', color: '#5F5E5A', borderRadius: 6, padding: '2px 7px' }}>{v.cuenta_nombre}</span>}</span>
                    ) : (
                      <select className="input" style={{ fontSize: 12, padding: '4px 6px', width: 150, borderColor: v.cuenta_manual ? undefined : '#E8313A' }}
                        value={v.cuenta_manual || ''} onChange={e => asignarCuenta(v, e.target.value)}>
                        <option value="">¿Qué cuenta?</option>
                        {cuentas.filter(c => c.activa || c.id === v.cuenta_manual).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="td" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.link_web ? <a href={v.link_web} target="_blank" rel="noreferrer" style={{ color: '#3B5BDB' }}>{v.link_web.replace('https://www.', '')}</a> : <span style={{ color: '#C0392B' }}>sin convertir</span>}
                  </td>
                  <td className="td" style={{ color: '#999' }}>{fechaHora(v.created_at)}</td>
                  <td className="td"><button className="btn-icon btn-icon-danger" onClick={() => borrar(v)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalAdd} onClose={() => !busy && setModalAdd(false)} title="Agregar videos">
        <div className="fg"><label className="label">Links de TikTok (uno por línea; móviles o de escritorio)</label>
          <textarea className="input" rows={8} value={texto} onChange={e => setTexto(e.target.value)} placeholder={'https://vt.tiktok.com/…\nhttps://vt.tiktok.com/…'} /></div>
        <div className="fg"><label className="label">Cuenta de TikTok (solo si el link no muestra el usuario)</label>
          <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
            <option value="">Sin asignar</option>
            {cuentas.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.handle ? ' · ' + c.handle : ''}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 2 }}>El usuario y la cuenta se detectan solos desde el link. Esto se usa únicamente cuando no se puede detectar.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" disabled={busy} onClick={() => setModalAdd(false)}>Cancelar</button>
          <button className="btn-red" disabled={busy} onClick={agregar}>{busy ? 'Convirtiendo y guardando…' : 'Agregar'}</button>
        </div>
      </Modal>

      <Modal open={modalEdit} onClose={() => setModalEdit(false)} title="Editar canción">
        <div className="fg"><label className="label">Canción</label>
          <input className="input" value={formEdit.cancion || ''} onChange={e => setFormEdit(f => ({ ...f, cancion: e.target.value }))} /></div>
        <div className="fg"><label className="label">Artista</label>
          <input className="input" value={formEdit.artista || ''} onChange={e => setFormEdit(f => ({ ...f, artista: e.target.value }))} /></div>
        <div className="fg"><label className="label">Link Tokchart (de este mes)</label>
          <input className="input" value={formEdit.tokchart_url || ''} onChange={e => setFormEdit(f => ({ ...f, tokchart_url: e.target.value }))} /></div>
        <div className="fg"><label className="label">Solicitada por</label>
          <select className="input" value={formEdit.solicitante || ''} onChange={e => setFormEdit(f => ({ ...f, solicitante: e.target.value }))}>
            <option value="">Sin indicar</option>
            {SOLICITANTES.map(n => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div className="fg"><label className="label">Notas</label>
          <textarea className="input" rows={2} value={formEdit.notas || ''} onChange={e => setFormEdit(f => ({ ...f, notas: e.target.value }))} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModalEdit(false)}>Cancelar</button>
          <button className="btn-red" onClick={guardarEditar}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}

// ═════════════════════════ CONFIGURACIÓN (cuentas + gráfico) ═════════════════════════
const COLORES_CUENTA = ['#E8313A', '#3B5BDB', '#1D9E75', '#BA7517', '#7C3AED', '#0369A1', '#C2185B']

function Config({ cuentas, onBack, onChanged }) {
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ nombre: '', handle: '' })
  const [mes, setMes] = useState(firstOfMonth(ymd(new Date())))
  const [datos, setDatos] = useState(null) // [{ id, nombre, n }]
  const [clientes, setClientes] = useState([])
  const [editores, setEditores] = useState([])
  const [nombreEditor, setNombreEditor] = useState('Editora')

  const cargarEditores = useCallback(async () => {
    try { setEditores(await sql`SELECT id, nombre, token, activo FROM sb_editor_tokens ORDER BY created_at DESC`) } catch (e) { console.error(e) }
  }, [])
  useEffect(() => { cargarEditores() }, [cargarEditores])
  const linkEditor = t => `${window.location.origin}/?editor=${t}`
  async function crearEditor() {
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    try { await sql`INSERT INTO sb_editor_tokens (nombre, token) VALUES (${nombreEditor.trim() || 'Editora'}, ${token})`; cargarEditores() } catch (e) { alert(e.message) }
  }
  async function toggleEditor(e) {
    try { await sql`UPDATE sb_editor_tokens SET activo = ${!e.activo} WHERE id = ${e.id}`; cargarEditores() } catch (err) { alert(err.message) }
  }
  async function borrarEditor(e) {
    if (!confirm('¿Borrar este link? Dejará de funcionar para siempre.')) return
    try { await sql`DELETE FROM sb_editor_tokens WHERE id = ${e.id}`; cargarEditores() } catch (err) { alert(err.message) }
  }
  function copiarLink(e) {
    const url = linkEditor(e.token)
    navigator.clipboard.writeText(url).then(() => alert('Link copiado')).catch(() => prompt('Copiá el link:', url))
  }

  const cargarClientes = useCallback(async () => {
    try { setClientes(await sql`SELECT id, nombre, social_boost_activo FROM clients ORDER BY nombre`) } catch (e) { console.error(e) }
  }, [])
  useEffect(() => { cargarClientes() }, [cargarClientes])
  async function toggleCliente(c) {
    try { await sql`UPDATE clients SET social_boost_activo = ${!c.social_boost_activo} WHERE id = ${c.id}`; cargarClientes() } catch (e) { alert(e.message) }
  }

  useEffect(() => {
    (async () => {
      try {
        const rows = await sql`SELECT cu.id, cu.nombre, count(*)::int AS n
          FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id
          LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
          WHERE c.mes = ${mes} GROUP BY cu.id, cu.nombre`
        setDatos(rows)
      } catch (e) { console.error(e); setDatos([]) }
    })()
  }, [mes, cuentas])

  function abrir(c) {
    setForm(c ? { nombre: c.nombre, handle: c.handle || '' } : { nombre: '', handle: '' })
    setModal({ c })
  }
  async function guardar() {
    if (!form.nombre.trim()) return alert('Falta el nombre / temática')
    try {
      if (modal.c) await sql`UPDATE sb_cuentas SET nombre=${form.nombre.trim()}, handle=${form.handle.trim()} WHERE id=${modal.c.id}`
      else await sql`INSERT INTO sb_cuentas (nombre, handle, notas) VALUES (${form.nombre.trim()}, ${form.handle.trim()}, '')`
      setModal(null); onChanged()
    } catch (e) { alert(e.message) }
  }
  async function toggle(c) {
    try { await sql`UPDATE sb_cuentas SET activa = ${!c.activa} WHERE id = ${c.id}`; onChanged() } catch (e) { alert(e.message) }
  }

  // Barras: una por cuenta (aunque tenga 0) + "Sin identificar" si hay videos sin cuenta
  const total = (datos || []).reduce((a, d) => a + d.n, 0)
  const filas = cuentas.filter(c => c.activa || (datos || []).some(d => d.id === c.id)).map((c, i) => ({
    key: c.id, nombre: c.nombre, handle: c.handle, color: COLORES_CUENTA[i % COLORES_CUENTA.length],
    n: (datos || []).find(d => d.id === c.id)?.n || 0,
  }))
  const sinId = (datos || []).find(d => !d.id)?.n || 0
  if (sinId) filas.push({ key: 'sin', nombre: 'Sin identificar', handle: '', color: '#CFCFCB', n: sinId })
  const mesDate = parseYmd(mes)
  const mesTxt = `${MESES[mesDate.getMonth()]} ${mesDate.getFullYear()}`
  const mover = n => { const d = parseYmd(mes); d.setMonth(d.getMonth() + n); setMes(firstOfMonth(ymd(d))) }

  return (
    <div style={{ padding: '28px 28px', maxWidth: 820, margin: '0 auto' }}>
      <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 14 }} onClick={onBack}>← Volver</button>
      <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 14 }}>Configuración</h1>

      {/* Gráfico */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Videos por cuenta de TikTok</div>
            <div style={{ fontSize: 12, color: '#999' }}>{total} video{total === 1 ? '' : 's'} en {mesTxt}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn-ghost" onClick={() => mover(-1)}>←</button>
            <div style={{ fontSize: 13, fontWeight: 500, minWidth: 110, textAlign: 'center' }}>{mesTxt}</div>
            <button className="btn-ghost" onClick={() => mover(1)}>→</button>
          </div>
        </div>
        {datos === null ? <div style={{ color: '#AAA', fontSize: 13 }}>Cargando…</div> : total === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay videos en este mes.</div>
        ) : (
          <>
            {/* Barra apilada con el reparto total */}
            <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: '#F0F0EE', marginBottom: 16 }}>
              {filas.filter(f => f.n > 0).map(f => <div key={f.key} title={`${f.nombre}: ${f.n}`} style={{ width: (f.n / total * 100) + '%', background: f.color }} />)}
            </div>
            {filas.map(f => {
              const pct = total ? Math.round(f.n / total * 100) : 0
              return (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                  <div style={{ width: 9, height: 9, borderRadius: 3, background: f.color, flexShrink: 0 }} />
                  <div style={{ width: 170, fontSize: 13, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nombre}</div>
                    {f.handle && <div style={{ fontSize: 11, color: '#AAA' }}>{f.handle}</div>}
                  </div>
                  <div style={{ flex: 1, height: 8, background: '#F0F0EE', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: pct + '%', height: '100%', background: f.color, borderRadius: 4 }} />
                  </div>
                  <div style={{ width: 96, textAlign: 'right', fontSize: 13 }}><b style={{ fontWeight: 500 }}>{pct}%</b> <span style={{ color: '#999', fontSize: 12 }}>· {f.n}</span></div>
                </div>
              )
            })}
            {sinId > 0 && <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 8 }}>"Sin identificar": videos cuyo usuario no coincide con ninguna cuenta. Cargá el usuario de TikTok de cada cuenta abajo.</div>}
          </>
        )}
      </div>

      {/* Cuentas */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Cuentas de TikTok</div>
          <div style={{ fontSize: 12, color: '#AAA' }}>Cada cuenta tiene su temática; el usuario sirve para reconocerla desde los links</div>
        </div>
        <button className="btn-red" style={{ fontSize: 12 }} onClick={() => abrir(null)}>＋ Nueva cuenta</button>
      </div>
      <div className="card">
        {cuentas.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay cuentas.</div>}
        {cuentas.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderTop: i ? '0.5px solid #F0F0EE' : 'none', opacity: c.activa ? 1 : 0.5 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5 }}>{c.nombre}</div>
              <div style={{ fontSize: 11.5, color: c.handle ? '#AAA' : '#C0392B' }}>{c.handle || 'falta el usuario de TikTok'}</div>
            </div>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => abrir(c)}>Editar</button>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggle(c)}>{c.activa ? 'Desactivar' : 'Activar'}</button>
          </div>
        ))}
      </div>
      {/* Link de la editora */}
      <div style={{ marginTop: 24, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Link para la editora</div>
        <div style={{ fontSize: 12, color: '#AAA' }}>Un link privado para subir videos, sin entrar al ROSTER. Quien lo tenga puede agregar links, así que compartilo solo con ella.</div>
      </div>
      <div className="card">
        {editores.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay links.</div>}
        {editores.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderTop: i ? '0.5px solid #F0F0EE' : 'none', opacity: e.activo ? 1 : 0.5, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 13.5 }}>{e.nombre}</div>
              <div style={{ fontSize: 11.5, color: '#AAA' }}>{e.activo ? 'Activo' : 'Desactivado'}</div>
            </div>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => copiarLink(e)}>Copiar link</button>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleEditor(e)}>{e.activo ? 'Desactivar' : 'Activar'}</button>
            <button className="btn-icon btn-icon-danger" onClick={() => borrarEditor(e)}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, padding: '11px 14px', borderTop: editores.length ? '0.5px solid #F0F0EE' : 'none' }}>
          <input className="input" value={nombreEditor} onChange={e => setNombreEditor(e.target.value)} placeholder="Nombre (ej. Editora)" style={{ flex: 1 }} />
          <button className="btn-red" style={{ fontSize: 12 }} onClick={crearEditor}>＋ Crear link</button>
        </div>
      </div>

      {/* Portal del cliente */}
      <div style={{ marginTop: 24, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Portal del cliente</div>
        <div style={{ fontSize: 12, color: '#AAA' }}>Los clientes activados ven una pestaña "Social Boost" (solo lectura) en su portal</div>
      </div>
      <div className="card">
        {clientes.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#AAA', fontSize: 13 }}>No hay clientes.</div>}
        {clientes.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderTop: i ? '0.5px solid #F0F0EE' : 'none' }}>
            <div style={{ flex: 1, fontSize: 13.5 }}>{c.nombre}</div>
            <button onClick={() => toggleCliente(c)} style={{
              fontSize: 12, padding: '4px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              background: c.social_boost_activo ? '#EAF3DE' : '#fff', color: c.social_boost_activo ? '#27500A' : '#888',
              border: '0.5px solid ' + (c.social_boost_activo ? 'transparent' : '#D0D0CC'),
            }}>{c.social_boost_activo ? 'Visible ✓' : 'Oculto'}</button>
          </div>
        ))}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.c ? 'Editar cuenta' : 'Nueva cuenta'}>
        <div className="fg"><label className="label">Nombre / temática</label>
          <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Anime" /></div>
        <div className="fg"><label className="label">Usuario de TikTok</label>
          <input className="input" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} placeholder="@usuario" /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn-red" onClick={guardar}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}
