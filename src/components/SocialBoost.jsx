import { useState, useEffect, useCallback } from 'react'
import sql from '../lib/db'
import Modal from './Modal'
import { convertMany, isMobileTikTok } from '../lib/links'

// ───────── helpers de fecha (todo como texto YYYY-MM-DD, sin husos horarios) ─────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const firstOfMonth = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
function mondayOf(s) {
  const d = parseYmd(s)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return ymd(d)
}
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
function mesLabel(s) { const d = parseYmd(s); return `${MESES[d.getMonth()]} ${d.getFullYear()}` }
function shiftMes(s, n) { const d = parseYmd(s); d.setMonth(d.getMonth() + n); return firstOfMonth(d) }
function semLabel(inicio) {
  const a = parseYmd(inicio), b = parseYmd(addDays(inicio, 6))
  return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)}`
}

function parseVideo(link) {
  const m = (link || '').match(/tiktok\.com\/@([^/?#]+)\/(?:video|photo)\/(\d+)/)
  return m ? { handle: m[1], video_id: m[2] } : { handle: '', video_id: '' }
}

const TIPOS_CONTENIDO = ['Lip sync', 'Trend', 'Storytelling', 'Meme', 'Behind the scenes', 'Baile', 'Otro']

const DECISION_STYLE = {
  mantener: { bg: '#EAF3DE', color: '#27500A', label: 'Mantener' },
  cambiar:  { bg: '#FCEBEB', color: '#A32D2D', label: 'Cambiar' },
}

export default function SocialBoost() {
  const hoy = new Date()
  const [mes, setMes] = useState(firstOfMonth(hoy))
  const [tab, setTab] = useState('semana')
  const [cuentas, setCuentas] = useState([])
  const [canciones, setCanciones] = useState([])
  const [semanas, setSemanas] = useState([])
  const [loading, setLoading] = useState(true)
  const [songOpen, setSongOpen] = useState(null) // id de canción abierta

  const cargar = useCallback(async () => {
    try {
      const [c, s, w] = await Promise.all([
        sql`SELECT id, nombre, handle, notas, activa FROM sb_cuentas ORDER BY nombre`,
        sql`SELECT id, mes::text AS mes, artista, cancion, tokchart_url, slot, estado, notas
            FROM sb_canciones WHERE mes = ${mes} ORDER BY slot NULLS LAST, created_at`,
        sql`SELECT id, mes::text AS mes, inicio::text AS inicio, cerrada, conclusion, conclusion_publicada
            FROM sb_semanas WHERE mes = ${mes} ORDER BY inicio`,
      ])
      setCuentas(c); setCanciones(s); setSemanas(w)
    } catch (e) { console.error(e); alert('Error cargando Social Boost: ' + e.message) }
    setLoading(false)
  }, [mes])

  useEffect(() => { setLoading(true); cargar() }, [cargar])

  const cancionAbierta = canciones.find(c => c.id === songOpen)

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1000, margin: '0 auto' }}>
      {cancionAbierta ? (
        <CancionPage cancion={cancionAbierta} cuentas={cuentas}
          onBack={() => { setSongOpen(null); cargar() }} onChanged={cargar} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 500 }}>Social Boost</h1>
              <div style={{ fontSize: 12, color: '#AAA' }}>Cuentas de community managers · 5 canciones por semana</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn-ghost" onClick={() => setMes(shiftMes(mes, -1))}>←</button>
              <div style={{ fontSize: 14, fontWeight: 500, minWidth: 130, textAlign: 'center' }}>{mesLabel(mes)}</div>
              <button className="btn-ghost" onClick={() => setMes(shiftMes(mes, 1))}>→</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F0F0EE', padding: 3, borderRadius: 10, width: 'fit-content' }}>
            {[['semana', 'Semana'], ['canciones', 'Canciones'], ['cuentas', 'Cuentas']].map(([id, label]) => (
              <div key={id} onClick={() => setTab(id)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                background: tab === id ? '#fff' : 'transparent',
                color: tab === id ? '#1A1A1A' : '#888',
                border: tab === id ? '0.5px solid #E5E5E2' : '0.5px solid transparent',
              }}>{label}</div>
            ))}
          </div>

          {loading ? <div style={{ color: '#AAA', fontSize: 13 }}>Cargando…</div> : (
            <>
              {tab === 'semana' && <TabSemana mes={mes} cuentas={cuentas} canciones={canciones} semanas={semanas} onChanged={cargar} />}
              {tab === 'canciones' && <TabCanciones mes={mes} canciones={canciones} onOpen={setSongOpen} onChanged={cargar} />}
              {tab === 'cuentas' && <TabCuentas cuentas={cuentas} onChanged={cargar} />}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ═════════════════════════ CANCIONES (5 slots) ═════════════════════════
function TabCanciones({ mes, canciones, onOpen, onChanged }) {
  const [modal, setModal] = useState(null) // { slot, song? }
  const [form, setForm] = useState({ artista: '', cancion: '', tokchart_url: '', notas: '' })
  const activas = canciones.filter(c => c.estado === 'activa')
  const salieron = canciones.filter(c => c.estado === 'salio')

  function abrir(slot, song) {
    setForm(song
      ? { artista: song.artista || '', cancion: song.cancion, tokchart_url: song.tokchart_url || '', notas: song.notas || '' }
      : { artista: '', cancion: '', tokchart_url: '', notas: '' })
    setModal({ slot, song })
  }

  async function guardar() {
    if (!form.cancion.trim()) return alert('Falta el nombre de la canción')
    try {
      if (modal.song) {
        await sql`UPDATE sb_canciones SET artista=${form.artista}, cancion=${form.cancion.trim()}, tokchart_url=${form.tokchart_url.trim()}, notas=${form.notas} WHERE id=${modal.song.id}`
      } else {
        await sql`INSERT INTO sb_canciones (mes, artista, cancion, tokchart_url, slot, estado, notas)
                  VALUES (${mes}, ${form.artista}, ${form.cancion.trim()}, ${form.tokchart_url.trim()}, ${modal.slot}, 'activa', ${form.notas})`
      }
      setModal(null); onChanged()
    } catch (e) { alert('No se pudo guardar: ' + e.message) }
  }

  async function marcarSalio(song) {
    if (!confirm(`"${song.cancion}" sale del plan este mes. Sus videos y datos quedan guardados. ¿Seguro?`)) return
    try {
      await sql`UPDATE sb_canciones SET estado='salio', slot=NULL WHERE id=${song.id}`
      onChanged()
    } catch (e) { alert(e.message) }
  }

  async function reactivar(song) {
    const ocupados = new Set(activas.map(c => c.slot))
    const libre = [1, 2, 3, 4, 5].find(s => !ocupados.has(s))
    if (!libre) return alert('Los 5 slots están ocupados. Sacá una canción primero.')
    try {
      await sql`UPDATE sb_canciones SET estado='activa', slot=${libre} WHERE id=${song.id}`
      onChanged()
    } catch (e) { alert(e.message) }
  }

  async function copiarMesAnterior() {
    const prev = shiftMes(mes, -1)
    try {
      const rows = await sql`SELECT artista, cancion, tokchart_url FROM sb_canciones WHERE mes=${prev} AND estado='activa' ORDER BY slot`
      if (!rows.length) return alert('El mes anterior no tiene canciones activas.')
      if (!confirm(`Traer ${rows.length} canción(es) activas de ${mesLabel(prev)}? Empiezan con videos en cero y necesitan su link de Tokchart nuevo.`)) return
      const ocupados = new Set(activas.map(c => c.slot))
      const libres = [1, 2, 3, 4, 5].filter(s => !ocupados.has(s))
      for (let i = 0; i < Math.min(rows.length, libres.length); i++) {
        await sql`INSERT INTO sb_canciones (mes, artista, cancion, tokchart_url, slot, estado) VALUES (${mes}, ${rows[i].artista}, ${rows[i].cancion}, '', ${libres[i]}, 'activa')`
      }
      onChanged()
    } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#888' }}>{activas.length} de 5 slots ocupados</div>
        {activas.length === 0 && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={copiarMesAnterior}>Traer del mes anterior</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {[1, 2, 3, 4, 5].map(slot => {
          const s = activas.find(c => c.slot === slot)
          return s ? (
            <div key={slot} className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 10, color: '#AAA', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Slot {slot}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{s.cancion}</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>{s.artista || '—'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn-red" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => onOpen(s.id)}>Abrir</button>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => abrir(slot, s)}>Editar</button>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => marcarSalio(s)}>Salió</button>
              </div>
            </div>
          ) : (
            <div key={slot} onClick={() => abrir(slot, null)} className="card" style={{
              padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', minHeight: 110, color: '#AAA', borderStyle: 'dashed',
            }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Slot {slot}</div>
              <div style={{ fontSize: 13 }}>＋ Agregar canción</div>
            </div>
          )
        })}
      </div>

      {salieron.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Salieron este mes</div>
          <div className="card">
            {salieron.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: i ? '0.5px solid #F0F0EE' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{s.cancion}</div>
                  <div style={{ fontSize: 11, color: '#AAA' }}>{s.artista || '—'}</div>
                </div>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onOpen(s.id)}>Ver</button>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => reactivar(s)}>Reactivar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.song ? 'Editar canción' : `Nueva canción · Slot ${modal?.slot}`}>
        <div className="fg"><label className="label">Canción</label>
          <input className="input" value={form.cancion} onChange={e => setForm(f => ({ ...f, cancion: e.target.value }))} /></div>
        <div className="fg"><label className="label">Artista</label>
          <input className="input" value={form.artista} onChange={e => setForm(f => ({ ...f, artista: e.target.value }))} /></div>
        <div className="fg"><label className="label">Link Tokchart (de este mes)</label>
          <input className="input" value={form.tokchart_url} onChange={e => setForm(f => ({ ...f, tokchart_url: e.target.value }))} placeholder="https://…" /></div>
        <div className="fg"><label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn-red" onClick={guardar}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}

// ═════════════════════════ SEMANA ═════════════════════════
function TabSemana({ mes, cuentas, canciones, semanas, onChanged }) {
  const [semId, setSemId] = useState(null)
  const [pruebas, setPruebas] = useState([])
  const [modal, setModal] = useState(null) // { cancion }
  const [form, setForm] = useState({ cuenta_id: '', tipo_contenido: TIPOS_CONTENIDO[0] })
  const [concl, setConcl] = useState({ texto: '', publicar: false })

  const sem = semanas.find(s => s.id === semId) || semanas[semanas.length - 1] || null
  const semActualId = sem?.id

  useEffect(() => { if (sem) setConcl({ texto: sem.conclusion || '', publicar: !!sem.conclusion_publicada }) }, [semActualId])

  const cargarPruebas = useCallback(async () => {
    if (!semActualId) { setPruebas([]); return }
    try {
      setPruebas(await sql`SELECT p.id, p.cancion_id, p.cuenta_id, p.tipo_contenido, p.decision, p.notas, c.nombre AS cuenta_nombre, c.handle AS cuenta_handle
        FROM sb_pruebas p LEFT JOIN sb_cuentas c ON c.id = p.cuenta_id WHERE p.semana_id = ${semActualId} ORDER BY p.created_at`)
    } catch (e) { console.error(e) }
  }, [semActualId])
  useEffect(() => { cargarPruebas() }, [cargarPruebas])

  async function crearSemana(inicio, copiarDeId) {
    try {
      const r = await sql`INSERT INTO sb_semanas (mes, inicio) VALUES (${mes}, ${inicio}) RETURNING id`
      if (copiarDeId) {
        // Se mantienen las pruebas que NO se decidió cambiar
        await sql`INSERT INTO sb_pruebas (semana_id, cancion_id, cuenta_id, tipo_contenido)
                  SELECT ${r[0].id}::uuid, cancion_id, cuenta_id, tipo_contenido FROM sb_pruebas
                  WHERE semana_id = ${copiarDeId} AND COALESCE(decision, 'mantener') <> 'cambiar'
                  AND cancion_id IN (SELECT id FROM sb_canciones WHERE estado = 'activa')`
      }
      setSemId(r[0].id)
      onChanged()
    } catch (e) { alert('No se pudo crear la semana (¿ya existe?): ' + e.message) }
  }

  function nuevaSemana() {
    const ultima = semanas[semanas.length - 1]
    const base = ultima ? addDays(ultima.inicio, 7) : mondayOf(ymd(new Date()))
    const inicio = base.slice(0, 7) === mes.slice(0, 7) ? base : mondayOf(mes)
    if (ultima && !ultima.cerrada && !confirm('La semana anterior sigue abierta. ¿Crear la siguiente igual?')) return
    crearSemana(inicio, ultima?.id)
  }

  async function agregarPrueba() {
    if (!form.cuenta_id) return alert('Elegí una cuenta')
    try {
      await sql`INSERT INTO sb_pruebas (semana_id, cancion_id, cuenta_id, tipo_contenido) VALUES (${semActualId}, ${modal.cancion.id}, ${form.cuenta_id}, ${form.tipo_contenido})`
      setModal(null); cargarPruebas()
    } catch (e) { alert(e.message) }
  }

  async function decidir(p, decision) {
    try {
      await sql`UPDATE sb_pruebas SET decision = ${p.decision === decision ? null : decision} WHERE id = ${p.id}`
      cargarPruebas()
    } catch (e) { alert(e.message) }
  }

  async function borrarPrueba(p) {
    if (!confirm('¿Quitar esta prueba de la semana?')) return
    try { await sql`DELETE FROM sb_pruebas WHERE id = ${p.id}`; cargarPruebas() } catch (e) { alert(e.message) }
  }

  async function cerrarSemana() {
    const sinDecision = pruebas.filter(p => !p.decision).length
    if (sinDecision && !confirm(`Hay ${sinDecision} prueba(s) sin decisión (se tomarán como "mantener"). ¿Cerrar la semana igual?`)) return
    if (!confirm('Al cerrar, la semana queda bloqueada y no se puede editar. ¿Cerrar?')) return
    try {
      await sql`UPDATE sb_semanas SET cerrada = true, conclusion = ${concl.texto}, conclusion_publicada = ${concl.publicar} WHERE id = ${semActualId}`
      onChanged()
    } catch (e) { alert(e.message) }
  }

  async function reabrir() {
    if (!confirm('¿Reabrir la semana para editarla?')) return
    try { await sql`UPDATE sb_semanas SET cerrada = false WHERE id = ${semActualId}`; onChanged() } catch (e) { alert(e.message) }
  }

  async function guardarConclusion() {
    try {
      await sql`UPDATE sb_semanas SET conclusion = ${concl.texto}, conclusion_publicada = ${concl.publicar} WHERE id = ${semActualId}`
      onChanged()
    } catch (e) { alert(e.message) }
  }

  const activas = canciones.filter(c => c.estado === 'activa')
  const idsConPruebas = new Set(pruebas.map(p => p.cancion_id))
  const visibles = [...activas, ...canciones.filter(c => c.estado !== 'activa' && idsConPruebas.has(c.id))]
  const bloqueada = !!sem?.cerrada

  if (!semanas.length) {
    return (
      <div className="card" style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>No hay semanas en {mesLabel(mes)}.</div>
        <button className="btn-red" onClick={() => crearSemana(mondayOf(mes === firstOfMonth(new Date()) ? ymd(new Date()) : mes), null)}>Crear primera semana</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {semanas.map(s => (
          <div key={s.id} onClick={() => setSemId(s.id)} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer',
            background: s.id === semActualId ? '#FCEBEB' : '#fff',
            color: s.id === semActualId ? '#A32D2D' : '#666',
            border: '0.5px solid ' + (s.id === semActualId ? '#F7C1C1' : '#E5E5E2'),
          }}>{semLabel(s.inicio)} {s.cerrada && '🔒'}</div>
        ))}
        <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={nuevaSemana}>＋ Semana siguiente</button>
      </div>

      {bloqueada && <div style={{ background: '#F1EFE8', color: '#5F5E5A', fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 12 }}>Semana cerrada: solo lectura.</div>}

      {visibles.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Agregá canciones en la pestaña Canciones.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibles.map(c => {
          const ps = pruebas.filter(p => p.cancion_id === c.id)
          return (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: ps.length ? 10 : 0 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.slot ? `${c.slot}. ` : ''}{c.cancion}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{c.artista || '—'}{c.estado === 'salio' ? ' · salió' : ''}</div>
                </div>
                {!bloqueada && c.estado === 'activa' && (
                  <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={() => { setForm({ cuenta_id: '', tipo_contenido: TIPOS_CONTENIDO[0] }); setModal({ cancion: c }) }}>＋ Prueba</button>
                )}
              </div>
              {ps.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderTop: '0.5px solid #F0F0EE' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13 }}>{p.cuenta_nombre || '—'} <span style={{ color: '#AAA', fontSize: 11 }}>{p.cuenta_handle}</span></div>
                    <div style={{ fontSize: 11.5, color: '#888' }}>{p.tipo_contenido || '—'}</div>
                  </div>
                  {['mantener', 'cambiar'].map(d => {
                    const on = p.decision === d
                    return (
                      <button key={d} disabled={bloqueada} onClick={() => decidir(p, d)} style={{
                        fontSize: 11.5, padding: '4px 10px', borderRadius: 7, cursor: bloqueada ? 'default' : 'pointer', fontFamily: 'inherit',
                        background: on ? DECISION_STYLE[d].bg : '#fff', color: on ? DECISION_STYLE[d].color : '#888',
                        border: '0.5px solid ' + (on ? 'transparent' : '#D0D0CC'),
                      }}>{DECISION_STYLE[d].label}</button>
                    )
                  })}
                  {!bloqueada && <button className="btn-icon btn-icon-danger" onClick={() => borrarPrueba(p)}>✕</button>}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {sem && (
        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Conclusión de la semana</div>
          <textarea className="input" rows={3} value={concl.texto} disabled={bloqueada}
            onChange={e => setConcl(c => ({ ...c, texto: e.target.value }))}
            placeholder="Qué funcionó, qué se cambia y por qué…" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', margin: '8px 0 12px' }}>
            <input type="checkbox" checked={concl.publicar} disabled={bloqueada}
              onChange={e => setConcl(c => ({ ...c, publicar: e.target.checked }))} />
            Publicar para el cliente (se muestra en su vista)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {bloqueada ? (
              <button className="btn-ghost" onClick={reabrir}>Reabrir semana</button>
            ) : (
              <>
                <button className="btn-ghost" onClick={guardarConclusion}>Guardar borrador</button>
                <button className="btn-red" onClick={cerrarSemana}>Cerrar semana 🔒</button>
              </>
            )}
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={`Prueba · ${modal?.cancion?.cancion || ''}`}>
        <div className="fg"><label className="label">Cuenta</label>
          <select className="input" value={form.cuenta_id} onChange={e => setForm(f => ({ ...f, cuenta_id: e.target.value }))}>
            <option value="">Elegir…</option>
            {cuentas.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre} {c.handle}</option>)}
          </select></div>
        <div className="fg"><label className="label">Tipo de contenido</label>
          <select className="input" value={form.tipo_contenido} onChange={e => setForm(f => ({ ...f, tipo_contenido: e.target.value }))}>
            {TIPOS_CONTENIDO.map(t => <option key={t}>{t}</option>)}
          </select></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn-red" onClick={agregarPrueba}>Agregar</button>
        </div>
      </Modal>
    </div>
  )
}

// ═════════════════════════ CUENTAS ═════════════════════════
function TabCuentas({ cuentas, onChanged }) {
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ nombre: '', handle: '', notas: '' })

  function abrir(c) {
    setForm(c ? { nombre: c.nombre, handle: c.handle || '', notas: c.notas || '' } : { nombre: '', handle: '', notas: '' })
    setModal({ c })
  }
  async function guardar() {
    if (!form.nombre.trim()) return alert('Falta el nombre')
    try {
      if (modal.c) await sql`UPDATE sb_cuentas SET nombre=${form.nombre.trim()}, handle=${form.handle.trim()}, notas=${form.notas} WHERE id=${modal.c.id}`
      else await sql`INSERT INTO sb_cuentas (nombre, handle, notas) VALUES (${form.nombre.trim()}, ${form.handle.trim()}, ${form.notas})`
      setModal(null); onChanged()
    } catch (e) { alert(e.message) }
  }
  async function toggle(c) {
    try { await sql`UPDATE sb_cuentas SET activa = ${!c.activa} WHERE id = ${c.id}`; onChanged() } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#888' }}>{cuentas.filter(c => c.activa).length} cuentas activas</div>
        <button className="btn-red" style={{ fontSize: 12 }} onClick={() => abrir(null)}>＋ Nueva cuenta</button>
      </div>
      <div className="card">
        {cuentas.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay cuentas.</div>}
        {cuentas.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderTop: i ? '0.5px solid #F0F0EE' : 'none', opacity: c.activa ? 1 : 0.5 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5 }}>{c.nombre}</div>
              <div style={{ fontSize: 11.5, color: '#AAA' }}>{c.handle || 'sin usuario'}</div>
            </div>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => abrir(c)}>Editar</button>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggle(c)}>{c.activa ? 'Desactivar' : 'Activar'}</button>
          </div>
        ))}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.c ? 'Editar cuenta' : 'Nueva cuenta'}>
        <div className="fg"><label className="label">Nombre (community manager)</label>
          <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} /></div>
        <div className="fg"><label className="label">Usuario TikTok</label>
          <input className="input" value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} placeholder="@usuario" /></div>
        <div className="fg"><label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} /></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn-red" onClick={guardar}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}

// ═════════════════════════ PÁGINA DE UNA CANCIÓN ═════════════════════════
function CancionPage({ cancion, cuentas, onBack, onChanged }) {
  const [videos, setVideos] = useState([])
  const [modal, setModal] = useState(false)
  const [texto, setTexto] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setVideos(await sql`SELECT v.id, v.link_original, v.link_web, v.handle, v.video_id, v.cuenta_id, c.nombre AS cuenta_nombre
        FROM sb_videos v LEFT JOIN sb_cuentas c ON c.id = v.cuenta_id WHERE v.cancion_id = ${cancion.id} ORDER BY v.created_at, v.id`)
    } catch (e) { console.error(e) }
  }, [cancion.id])
  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    const lineas = [...new Set(texto.split(/\s+/).map(s => s.trim()).filter(l => /^https?:\/\//i.test(l)))]
    if (!lineas.length) return alert('Pegá al menos un link (uno por línea).')
    setBusy(true)
    try {
      const conv = await convertMany(lineas)
      let nuevos = 0, repetidos = 0, sinConvertir = 0
      for (let i = 0; i < lineas.length; i++) {
        const web = conv[i].error ? '' : conv[i].url
        if (conv[i].error) sinConvertir++
        const { handle, video_id } = parseVideo(web)
        const r = await sql`INSERT INTO sb_videos (cancion_id, cuenta_id, link_original, link_web, handle, video_id)
          VALUES (${cancion.id}, ${cuentaId || null}, ${lineas[i]}, ${web}, ${handle}, ${video_id})
          ON CONFLICT DO NOTHING RETURNING id`
        if (r.length) nuevos++; else repetidos++
      }
      setModal(false); setTexto('')
      await cargar()
      alert(`Agregados: ${nuevos}` + (repetidos ? `\nRepetidos (ignorados): ${repetidos}` : '') + (sinConvertir ? `\nSin convertir: ${sinConvertir} (usá "Reintentar conversión")` : ''))
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
        try {
          await sql`UPDATE sb_videos SET link_web=${conv[i].url}, handle=${handle}, video_id=${video_id} WHERE id=${pend[i].id}`
          ok++
        } catch (e) { /* duplicado: queda como estaba */ }
      }
      await cargar()
      alert(`Convertidos: ${ok} de ${pend.length}`)
    } catch (e) { alert(e.message) }
    setBusy(false)
  }

  async function borrar(v) {
    if (!confirm('¿Quitar este video?')) return
    try { await sql`DELETE FROM sb_videos WHERE id = ${v.id}`; cargar() } catch (e) { alert(e.message) }
  }

  function copiarTodos() {
    const links = videos.map(v => v.link_web || v.link_original).filter(Boolean)
    if (!links.length) return alert('No hay links.')
    navigator.clipboard.writeText(links.join('\n'))
      .then(() => alert(`${links.length} links copiados`))
      .catch(() => prompt('Copiá:', links.join('\n')))
  }

  const pendientes = videos.filter(v => !v.link_web || isMobileTikTok(v.link_web)).length

  return (
    <div>
      <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 14 }} onClick={onBack}>← Volver</button>
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>{cancion.cancion}</div>
            <div style={{ fontSize: 12.5, color: '#888' }}>{cancion.artista || '—'} · {mesLabel(cancion.mes)}{cancion.slot ? ` · Slot ${cancion.slot}` : ' · salió'}</div>
          </div>
          {cancion.tokchart_url
            ? <a href={cancion.tokchart_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>Ver reporte Tokchart ↗</a>
            : <div style={{ fontSize: 12, color: '#C0392B' }}>Falta el link de Tokchart de este mes</div>}
        </div>
        {cancion.notas && <div style={{ fontSize: 12.5, color: '#666', marginTop: 10 }}>{cancion.notas}</div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Videos <span style={{ color: '#AAA', fontWeight: 400 }}>({videos.length})</span></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pendientes > 0 && <button className="btn-ghost" style={{ fontSize: 12 }} disabled={busy} onClick={reintentar}>{busy ? 'Convirtiendo…' : `Reintentar conversión (${pendientes})`}</button>}
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={copiarTodos}>Copiar todos los links</button>
          <button className="btn-red" style={{ fontSize: 12 }} onClick={() => setModal(true)}>＋ Agregar videos</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {videos.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay videos para esta canción.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
              <th className="th">#</th><th className="th">Cuenta</th><th className="th">Usuario</th><th className="th">Link</th><th className="th"></th>
            </tr></thead>
            <tbody>
              {videos.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                  <td className="td" style={{ color: '#AAA' }}>{i + 1}</td>
                  <td className="td">{v.cuenta_nombre || '—'}</td>
                  <td className="td">{v.handle ? '@' + v.handle : '—'}</td>
                  <td className="td" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.link_web
                      ? <a href={v.link_web} target="_blank" rel="noreferrer" style={{ color: '#3B5BDB' }}>{v.link_web.replace('https://www.', '')}</a>
                      : <span style={{ color: '#C0392B' }}>sin convertir</span>}
                  </td>
                  <td className="td"><button className="btn-icon btn-icon-danger" onClick={() => borrar(v)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modal} onClose={() => !busy && setModal(false)} title="Agregar videos">
        <div className="fg"><label className="label">Links de TikTok (uno por línea, móviles o de escritorio)</label>
          <textarea className="input" rows={8} value={texto} onChange={e => setTexto(e.target.value)} placeholder={'https://vt.tiktok.com/…\nhttps://vt.tiktok.com/…'} /></div>
        <div className="fg"><label className="label">Cuenta (opcional, aplica a todos)</label>
          <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
            <option value="">Sin asignar</option>
            {cuentas.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre} {c.handle}</option>)}
          </select></div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" disabled={busy} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-red" disabled={busy} onClick={agregar}>{busy ? 'Convirtiendo y guardando…' : 'Agregar'}</button>
        </div>
      </Modal>
    </div>
  )
}
