import { useState, useEffect } from 'react'
import sql from '../lib/db'
import Modal from './Modal'
import ImportarCSV from './ImportarCSV'

const TIPO_COLORS = {
  Bailes:    { bg: '#EEEDFE', color: '#3C3489' },
  Reviewers: { bg: '#E6F1FB', color: '#0C447C' },
  Humor:     { bg: '#FAEEDA', color: '#633806' },
  Lifestyle: { bg: '#E1F5EE', color: '#085041' },
  Música:    { bg: '#FAECE7', color: '#712B13' },
  Gaming:    { bg: '#FBEAF0', color: '#72243E' },
  Moda:      { bg: '#FEF0FB', color: '#6B1560' },
  Fitness:   { bg: '#E8F5E9', color: '#1B5E20' },
  Viajes:    { bg: '#E3F2FD', color: '#0D47A1' },
  Otros:     { bg: '#F1EFE8', color: '#444441' },
}

const SIZE_RANGES = [
  { label: 'Nano',  min: 0,       max: 10000,    bg: '#F1EFE8', color: '#5F5E5A' },
  { label: 'Micro', min: 10000,   max: 150000,   bg: '#E6F1FB', color: '#0C447C' },
  { label: 'Mid',   min: 150000,  max: 750000,   bg: '#EEEDFE', color: '#3C3489' },
  { label: 'Macro', min: 750000,  max: 4000000,  bg: '#EAF3DE', color: '#27500A' },
  { label: 'Mega',  min: 4000000, max: Infinity, bg: '#FAEEDA', color: '#633806' },
]

const ESTADO_CAMP_COLORS = {
  Activa:    { bg: '#EAF3DE', color: '#27500A' },
  Pausada:   { bg: '#FAEEDA', color: '#633806' },
  Cerrada:   { bg: '#E6F1FB', color: '#0C447C' },
  Cancelada: { bg: '#FCEBEB', color: '#791F1F' },
}

const RETENCION_HONORARIOS = 0.1525
const IVA = 0.19

function calcCosto(base, tipo) {
  const b = Number(base) || 0
  if (tipo === 'honorarios')  return Math.round(b / (1 - RETENCION_HONORARIOS))
  if (tipo === 'factura_iva') return Math.round(b * (1 + IVA))
  return b
}

function getSize(n) {
  n = Number(n)
  return SIZE_RANGES.find(r => n >= r.min && n < r.max) || SIZE_RANGES[0]
}

const AV_COLORS = [
  { bg: '#F6F0E8', color: '#C4501A' },
  { bg: '#F3EEE7', color: '#8A2E0C' },
  { bg: '#F7F1EA', color: '#C4501A' },
  { bg: '#F2EDE6', color: '#3A1608' },
  { bg: '#F6F0E8', color: '#E58A3E' },
  { bg: '#F3EEE7', color: '#C4501A' },
  { bg: '#F7F1EA', color: '#8A2E0C' },
  { bg: '#F2EDE6', color: '#C4501A' },
]

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function fmtMoney(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 720 : false
  )
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 720) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

function Avatar({ nombre, index, size = 32 }) {
  const c = AV_COLORS[index % AV_COLORS.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c.bg, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 500, flexShrink: 0,
      border: '0.5px solid rgba(0,0,0,0.06)',
    }}>
      {nombre?.[0]?.toUpperCase()}
    </div>
  )
}

function UserLink({ username, link }) {
  if (!username) return <span style={{ color: '#CCC' }}>—</span>
  if (link) return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      style={{ color: '#C4501A', textDecoration: 'none', fontSize: 12.5 }}
      onMouseEnter={e => e.target.style.textDecoration = 'underline'}
      onMouseLeave={e => e.target.style.textDecoration = 'none'}
    >{username} ↗</a>
  )
  return <span style={{ fontSize: 12.5, color: '#555' }}>{username}</span>
}

function TiposBadges({ tipos, max }) {
  if (!tipos || tipos.length === 0) return <span style={{ color: '#CCC', fontSize: 11 }}>—</span>
  const shown = max ? tipos.slice(0, max) : tipos
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {shown.map(t => {
        const c = TIPO_COLORS[t] || TIPO_COLORS['Otros']
        return <span key={t} style={{ background: c.bg, color: c.color, padding: '1px 7px', borderRadius: 20, fontSize: 10.5 }}>{t}</span>
      })}
      {max && tipos.length > max && <span style={{ fontSize: 10.5, color: '#AAA' }}>+{tipos.length - max}</span>}
    </div>
  )
}

function TiposCheckboxes({ selected, onChange, categorias = [] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {categorias.map(t => {
        const isSelected = selected.includes(t)
        const c = TIPO_COLORS[t] || { bg: '#F1EFE8', color: '#444441' }
        return (
          <div key={t}
            onClick={() => {
              if (isSelected) onChange(selected.filter(x => x !== t))
              else onChange([...selected, t])
            }}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer',
              background: isSelected ? c.bg : '#F7F7F5',
              color: isSelected ? c.color : '#888',
              border: `0.5px solid ${isSelected ? c.color + '44' : '#E5E5E2'}`,
              transition: 'all .12s', userSelect: 'none',
              minHeight: 32, display: 'flex', alignItems: 'center',
            }}
          >
            {isSelected ? '✓ ' : ''}{t}
          </div>
        )
      })}
    </div>
  )
}

const EMPTY = {
  nombre: '', ig_usuario: '', ig_seguidores: '', ig_link: '',
  tt_usuario: '', tt_seguidores: '', tt_link: '',
  tipos_contenido: [], estado: 'Activo', notas: '',
}

function getDuplicateMessage(errorMsg) {
  if (!errorMsg) return null
  const msg = errorMsg.toLowerCase()
  if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already exists') || msg.includes('violates')) {
    if (msg.includes('tt_usuario')) return 'Ya existe un influencer con ese usuario de TikTok.'
    if (msg.includes('ig_usuario')) return 'Ya existe un influencer con ese usuario de Instagram.'
    return 'Ya existe un influencer con ese usuario de TikTok o Instagram.'
  }
  return null
}

// ─── PANEL LATERAL DE INFLUENCER ───
function InfluencerPanel({ inf, index, isMobile, onClose, onEdit }) {
  const [historial, setHistorial] = useState([])
  const [loadingH, setLoadingH] = useState(true)

  useEffect(() => {
    if (!inf) return
    fetchHistorial(inf.id)
  }, [inf?.id])

  async function fetchHistorial(infId) {
    setLoadingH(true)
    try {
      const data = await sql`
        SELECT
          ci.costo, ci.piezas, ci.tipo_facturacion, ci.created_at AS ci_created_at,
          c.id AS camp_id, c.nombre AS camp_nombre, c.cliente, c.estado AS camp_estado,
          c.tipo AS camp_tipo, c.created_at AS camp_created_at, c.moneda
        FROM campaign_influencers ci
        JOIN campaigns c ON c.id = ci.campaign_id
        WHERE ci.influencer_id = ${infId}
        ORDER BY c.created_at DESC
      `
      setHistorial(data)
    } catch (e) { console.error(e) }
    setLoadingH(false)
  }

  if (!inf) return null

  const igSize = getSize(inf.ig_seguidores)
  const ttSize = getSize(inf.tt_seguidores)
  const tipos = inf.tipos_contenido || []

  // Último precio — primera entrada del historial que tenga costo > 0
  const ultimaParticipacion = historial.find(h => Number(h.costo) > 0)
  const ultimoPrecio = ultimaParticipacion
    ? calcCosto(ultimaParticipacion.costo, ultimaParticipacion.tipo_facturacion)
    : null

  const panelWidth = isMobile ? '100%' : 400

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)',
          zIndex: 200, backdropFilter: 'blur(1px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: panelWidth,
        background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {/* Header panel */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '0.5px solid #E5E5E2', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: '#AAA', cursor: 'pointer', padding: 4 }}>✕</button>
            <button className="btn-ghost" onClick={() => { onClose(); onEdit(inf) }} style={{ fontSize: 12 }}>✎ Editar</button>
          </div>

          {/* Identidad */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Avatar nombre={inf.nombre} index={index} size={48} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 3 }}>{inf.nombre}</div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: inf.estado === 'Activo' ? '#EAF3DE' : '#F1EFE8',
                color: inf.estado === 'Activo' ? '#27500A' : '#5F5E5A',
              }}>{inf.estado}</span>
            </div>
          </div>

          {/* Redes */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {inf.ig_seguidores > 0 && (
              <div style={{ flex: 1, background: '#F7F7F5', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Instagram</div>
                <UserLink username={inf.ig_usuario} link={inf.ig_link} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: '#AAA' }}>{fmtSeg(inf.ig_seguidores)}</span>
                  <span style={{ background: igSize.bg, color: igSize.color, padding: '0 5px', borderRadius: 10, fontSize: 10 }}>{igSize.label}</span>
                </div>
              </div>
            )}
            {inf.tt_seguidores > 0 && (
              <div style={{ flex: 1, background: '#F7F7F5', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>TikTok</div>
                <UserLink username={inf.tt_usuario} link={inf.tt_link} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: '#AAA' }}>{fmtSeg(inf.tt_seguidores)}</span>
                  <span style={{ background: ttSize.bg, color: ttSize.color, padding: '0 5px', borderRadius: 10, fontSize: 10 }}>{ttSize.label}</span>
                </div>
              </div>
            )}
          </div>

          {/* Categorías */}
          <TiposBadges tipos={tipos} />

          {/* Notas */}
          {inf.notas && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#888', background: '#F7F7F5', borderRadius: 8, padding: '8px 10px' }}>
              {inf.notas}
            </div>
          )}
        </div>

        {/* Último precio */}
        {ultimoPrecio && (
          <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #E5E5E2', flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Último precio registrado</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 500, color: '#1A1A1A' }}>{fmtMoney(ultimoPrecio)}</span>
              <span style={{ fontSize: 12, color: '#AAA' }}>en {ultimaParticipacion.camp_nombre}</span>
            </div>
            {ultimaParticipacion.tipo_facturacion && ultimaParticipacion.tipo_facturacion !== 'sin_recargo' && (
              <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                base {fmtMoney(ultimaParticipacion.costo)} ·{' '}
                {ultimaParticipacion.tipo_facturacion === 'honorarios' ? 'Boleta' : 'Factura IVA'}
              </div>
            )}
          </div>
        )}

        {/* Historial de campañas */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
            Historial de campañas
            {historial.length > 0 && <span style={{ fontSize: 11, color: '#AAA', fontWeight: 400, marginLeft: 6 }}>{historial.length} campañas</span>}
          </div>

          {loadingH ? (
            <div style={{ fontSize: 13, color: '#AAA', textAlign: 'center', padding: 24 }}>Cargando...</div>
          ) : historial.length === 0 ? (
            <div style={{ fontSize: 13, color: '#AAA', textAlign: 'center', padding: 32, background: '#F7F7F5', borderRadius: 10 }}>
              Este influencer todavía no ha participado en ninguna campaña.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historial.map((h, i) => {
                const ec = ESTADO_CAMP_COLORS[h.camp_estado] || ESTADO_CAMP_COLORS['Activa']
                const costoFinal = calcCosto(h.costo, h.tipo_facturacion)
                return (
                  <div key={i} style={{
                    background: '#F7F7F5', border: '0.5px solid #E5E5E2',
                    borderRadius: 10, padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, lineHeight: 1.3 }}>{h.camp_nombre}</div>
                      <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 20, background: ec.bg, color: ec.color, flexShrink: 0 }}>
                        {h.camp_estado}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#888' }}>
                      {h.cliente && <span>👤 {h.cliente}</span>}
                      {h.camp_tipo && h.camp_tipo !== 'Estándar' && (
                        <span style={{ background: '#1A1A1A', color: '#fff', padding: '0 6px', borderRadius: 10, fontSize: 10 }}>{h.camp_tipo}</span>
                      )}
                      <span>📅 {fmtDate(h.camp_created_at)}</span>
                    </div>
                    {costoFinal > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 500 }}>{fmtMoney(costoFinal)}</span>
                        {h.tipo_facturacion && h.tipo_facturacion !== 'sin_recargo' && (
                          <span style={{ fontSize: 11, color: '#AAA' }}>
                            base {fmtMoney(h.costo)} · {h.tipo_facturacion === 'honorarios' ? 'Boleta' : 'Factura IVA'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function Roster() {
  const isMobile = useIsMobile()
  const [influencers, setInfluencers] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterSize, setFilterSize] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Panel lateral
  const [selectedInf, setSelectedInf] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Modal crear/editar
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [duplicateError, setDuplicateError] = useState(null)

  useEffect(() => { fetchInfluencers() }, [])

  async function fetchInfluencers() {
    setLoading(true)
    try {
      const [data, cats] = await Promise.all([
        sql`SELECT *, tt_seguidores AS total_seguidores FROM influencers ORDER BY tt_seguidores DESC`,
        sql`SELECT nombre FROM categorias_influencer WHERE activo = true ORDER BY nombre ASC`,
      ])
      setInfluencers(data)
      setCategorias(cats.map(c => c.nombre))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function openPanel(inf, index) {
    setSelectedInf(inf)
    setSelectedIndex(index)
  }

  function openNew() {
    setForm(EMPTY)
    setEditId(null)
    setDuplicateError(null)
    setModalOpen(true)
  }

  function openEdit(inf) {
    setForm({
      nombre: inf.nombre,
      ig_usuario: inf.ig_usuario || '',
      ig_seguidores: inf.ig_seguidores,
      ig_link: inf.ig_link || '',
      tt_usuario: inf.tt_usuario || '',
      tt_seguidores: inf.tt_seguidores,
      tt_link: inf.tt_link || '',
      tipos_contenido: inf.tipos_contenido || [],
      estado: inf.estado,
      notas: inf.notas || '',
    })
    setEditId(inf.id)
    setDuplicateError(null)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return
    setSaving(true)
    setDuplicateError(null)
    try {
      const ig_seg = parseInt(form.ig_seguidores) || 0
      const tt_seg = parseInt(form.tt_seguidores) || 0
      if (editId) {
        await sql`
          UPDATE influencers SET
            nombre = ${form.nombre}, ig_usuario = ${form.ig_usuario},
            ig_seguidores = ${ig_seg}, ig_link = ${form.ig_link},
            tt_usuario = ${form.tt_usuario}, tt_seguidores = ${tt_seg},
            tt_link = ${form.tt_link}, tipos_contenido = ${form.tipos_contenido},
            estado = ${form.estado}, notas = ${form.notas}
          WHERE id = ${editId}
        `
      } else {
        await sql`
          INSERT INTO influencers (
            nombre, ig_usuario, ig_seguidores, ig_link,
            tt_usuario, tt_seguidores, tt_link,
            tipos_contenido, estado, notas
          ) VALUES (
            ${form.nombre}, ${form.ig_usuario}, ${ig_seg}, ${form.ig_link},
            ${form.tt_usuario}, ${tt_seg}, ${form.tt_link},
            ${form.tipos_contenido}, ${form.estado}, ${form.notas}
          )
        `
      }
      setModalOpen(false)
      setDuplicateError(null)
      // Si estaba abierto el panel del influencer editado, actualizar
      if (editId && selectedInf?.id === editId) setSelectedInf(null)
      await fetchInfluencers()
    } catch (e) {
      const dupMsg = getDuplicateMessage(e.message)
      if (dupMsg) setDuplicateError(dupMsg)
      else console.error(e)
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    try {
      await sql`DELETE FROM influencers WHERE id = ${id}`
      setDeleteId(null)
      if (selectedInf?.id === id) setSelectedInf(null)
      await fetchInfluencers()
    } catch (e) { console.error(e) }
  }

  const filtered = influencers
    .filter(i => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        i.nombre.toLowerCase().includes(q) ||
        (i.ig_usuario || '').toLowerCase().includes(q) ||
        (i.tt_usuario || '').toLowerCase().includes(q)
      const tipos = i.tipos_contenido || []
      const matchTipo = !filterTipo || tipos.includes(filterTipo)
      const matchEstado = !filterEstado || i.estado === filterEstado
      const matchSize = !filterSize || getSize(i.tt_seguidores).label === filterSize
      return matchSearch && matchTipo && matchEstado && matchSize
    })
    .sort((a, b) => {
      const diff = Number(b.tt_seguidores) - Number(a.tt_seguidores)
      return sortAsc ? -diff : diff
    })

  const activeFiltersCount = [filterTipo, filterSize, filterEstado].filter(Boolean).length

  return (
    <div style={{ padding: isMobile ? '16px' : '20px 24px' }}>

      {/* Panel lateral */}
      {selectedInf && (
        <InfluencerPanel
          inf={selectedInf}
          index={selectedIndex}
          isMobile={isMobile}
          onClose={() => setSelectedInf(null)}
          onEdit={openEdit}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500 }}>Roster</h1>
          <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {influencers.length} influencers · {influencers.filter(i => i.estado === 'Activo').length} activos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isMobile && <ImportarCSV onDone={fetchInfluencers} />}
          <button className="btn-red" onClick={openNew} style={{ fontSize: isMobile ? 13 : 14, padding: isMobile ? '7px 12px' : undefined }}>
            {isMobile ? '+ Nuevo' : '+ Nuevo influencer'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {isMobile ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="Buscar nombre o usuario..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minHeight: 42, fontSize: 14 }} />
            <button
              onClick={() => setFiltersOpen(o => !o)}
              style={{
                minHeight: 42, minWidth: 42, borderRadius: 8,
                border: '0.5px solid #E5E5E2',
                background: activeFiltersCount > 0 ? '#FCEBEB' : '#fff',
                color: activeFiltersCount > 0 ? '#A32D2D' : '#555',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, position: 'relative', flexShrink: 0,
              }}
            >
              ⚙
              {activeFiltersCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, width: 16, height: 16,
                  borderRadius: '50%', background: '#C4501A', color: '#fff',
                  fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{activeFiltersCount}</span>
              )}
            </button>
          </div>
          {filtersOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: 12 }}>
              <select className="input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)} style={{ minHeight: 42 }}>
                <option value="">Todos los tipos</option>
                {categorias.map(t => <option key={t}>{t}</option>)}
              </select>
              <select className="input" value={filterSize} onChange={e => setFilterSize(e.target.value)} style={{ minHeight: 42 }}>
                <option value="">Todos los tamaños</option>
                {SIZE_RANGES.map(s => <option key={s.label}>{s.label}</option>)}
              </select>
              <select className="input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ minHeight: 42 }}>
                <option value="">Todos los estados</option>
                <option>Activo</option><option>Inactivo</option>
              </select>
              <select className="input" value={sortAsc ? 'asc' : 'desc'} onChange={e => setSortAsc(e.target.value === 'asc')} style={{ minHeight: 42 }}>
                <option value="desc">Mayor alcance primero</option>
                <option value="asc">Menor alcance primero</option>
              </select>
              {activeFiltersCount > 0 && (
                <button className="btn-ghost" style={{ minHeight: 40 }} onClick={() => { setFilterTipo(''); setFilterSize(''); setFilterEstado('') }}>
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input className="input" placeholder="Buscar nombre o usuario..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 220, flex: 1, maxWidth: 300 }} />
          <select className="input" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {categorias.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input" value={filterSize} onChange={e => setFilterSize(e.target.value)}>
            <option value="">Todos los tamaños</option>
            {SIZE_RANGES.map(s => <option key={s.label}>{s.label}</option>)}
          </select>
          <select className="input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option>Activo</option><option>Inactivo</option>
          </select>
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
          {search || filterTipo || filterEstado || filterSize ? 'Sin resultados para ese filtro' : 'Aún no hay influencers. Agrega el primero.'}
        </div>
      ) : isMobile ? (
        // ─── VISTA MOBILE: tarjetas ───
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((inf, i) => {
            const igSize = getSize(inf.ig_seguidores)
            const ttSize = getSize(inf.tt_seguidores)
            const tipos = inf.tipos_contenido || []
            const isActivo = inf.estado === 'Activo'
            const isSelected = selectedInf?.id === inf.id
            return (
              <div key={inf.id}
                onClick={() => openPanel(inf, i)}
                style={{
                  background: '#fff', border: `0.5px solid ${isSelected ? '#C4501A' : '#E5E5E2'}`,
                  borderRadius: 12, padding: '14px', opacity: isActivo ? 1 : 0.65,
                  cursor: 'pointer', transition: 'border-color .15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Avatar nombre={inf.nombre} index={i} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inf.nombre}</div>
                    <span style={{
                      fontSize: 10.5,
                      background: isActivo ? '#EAF3DE' : '#F1EFE8',
                      color: isActivo ? '#27500A' : '#5F5E5A',
                      padding: '1px 7px', borderRadius: 20,
                    }}>{inf.estado}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(inf)}
                      style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid #E5E5E2', background: '#F7F7F5', color: '#555', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
                    <button onClick={() => setDeleteId(inf.id)}
                      style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid #FDDADA', background: '#FBEFE3', color: '#C0392B', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  {inf.ig_seguidores > 0 && (
                    <div style={{ flex: 1, background: '#F7F7F5', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Instagram</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A' }}>{inf.ig_usuario || '—'}</span>
                        <span style={{ background: igSize.bg, color: igSize.color, padding: '0 5px', borderRadius: 10, fontSize: 10 }}>{igSize.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{fmtSeg(inf.ig_seguidores)}</div>
                    </div>
                  )}
                  {inf.tt_seguidores > 0 && (
                    <div style={{ flex: 1, background: '#F7F7F5', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>TikTok</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A' }}>{inf.tt_usuario || '—'}</span>
                        <span style={{ background: ttSize.bg, color: ttSize.color, padding: '0 5px', borderRadius: 10, fontSize: 10 }}>{ttSize.label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{fmtSeg(inf.tt_seguidores)}</div>
                    </div>
                  )}
                </div>
                <TiposBadges tipos={tipos} max={4} />
              </div>
            )
          })}
        </div>
      ) : (
        // ─── VISTA DESKTOP: tabla ───
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                  <th className="th" style={{ width: 200 }}>Influencer</th>
                  <th className="th" style={{ width: 160 }}>Instagram</th>
                  <th className="th" style={{ width: 160 }}>TikTok</th>
                  <th className="th" style={{ width: 110, cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortAsc(s => !s)}>
                    TikTok seg. {sortAsc ? '↑' : '↓'}
                  </th>
                  <th className="th" style={{ width: 200 }}>Categorías</th>
                  <th className="th" style={{ width: 80 }}>Estado</th>
                  <th className="th" style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inf, i) => {
                  const igSize = getSize(inf.ig_seguidores)
                  const ttSize = getSize(inf.tt_seguidores)
                  const isSelected = selectedInf?.id === inf.id
                  return (
                    <tr key={inf.id}
                      onClick={() => openPanel(inf, i)}
                      style={{
                        borderBottom: '0.5px solid #F0F0EE', cursor: 'pointer',
                        background: isSelected ? '#FBEFE3' : 'transparent',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#F7F7F5' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <td className="td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar nombre={inf.nombre} index={i} />
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{inf.nombre}</span>
                        </div>
                      </td>
                      <td className="td">
                        <UserLink username={inf.ig_usuario} link={inf.ig_link} />
                        {inf.ig_seguidores > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            <span style={{ fontSize: 11, color: '#AAA' }}>{fmtSeg(inf.ig_seguidores)}</span>
                            <span style={{ background: igSize.bg, color: igSize.color, padding: '0 6px', borderRadius: 20, fontSize: 10 }}>{igSize.label}</span>
                          </div>
                        )}
                      </td>
                      <td className="td">
                        <UserLink username={inf.tt_usuario} link={inf.tt_link} />
                        {inf.tt_seguidores > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                            <span style={{ fontSize: 11, color: '#AAA' }}>{fmtSeg(inf.tt_seguidores)}</span>
                            <span style={{ background: ttSize.bg, color: ttSize.color, padding: '0 6px', borderRadius: 20, fontSize: 10 }}>{ttSize.label}</span>
                          </div>
                        )}
                      </td>
                      <td className="td">
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{fmtSeg(Number(inf.tt_seguidores))}</span>
                      </td>
                      <td className="td"><TiposBadges tipos={inf.tipos_contenido} /></td>
                      <td className="td">
                        <span style={{
                          background: inf.estado === 'Activo' ? '#EAF3DE' : '#F1EFE8',
                          color: inf.estado === 'Activo' ? '#27500A' : '#5F5E5A',
                          padding: '2px 9px', borderRadius: 20, fontSize: 11,
                        }}>{inf.estado}</span>
                      </td>
                      <td className="td" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" onClick={() => openEdit(inf)} title="Editar">✎</button>
                          <button className="btn-icon btn-icon-danger" onClick={() => setDeleteId(inf.id)} title="Eliminar">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setDuplicateError(null) }} title={editId ? 'Editar influencer' : 'Nuevo influencer'}>
        <div className="fg">
          <label className="label">Nombre</label>
          <input className="input" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Nombre completo" style={{ fontSize: isMobile ? 16 : 14 }} />
        </div>
        <div style={{ background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>Instagram</div>
          <div className="form-row-2">
            <div className="fg">
              <label className="label">Usuario</label>
              <input className="input" value={form.ig_usuario}
                onChange={e => { setForm(f => ({ ...f, ig_usuario: e.target.value })); setDuplicateError(null) }}
                placeholder="@usuario" style={{ fontSize: isMobile ? 16 : 14 }} />
            </div>
            <div className="fg">
              <label className="label">Seguidores</label>
              <input className="input" type="number" value={form.ig_seguidores}
                onChange={e => setForm(f => ({ ...f, ig_seguidores: e.target.value }))}
                placeholder="0" style={{ fontSize: isMobile ? 16 : 14 }} />
            </div>
          </div>
          <div className="fg">
            <label className="label">Link de perfil</label>
            <input className="input" value={form.ig_link}
              onChange={e => setForm(f => ({ ...f, ig_link: e.target.value }))}
              placeholder="https://instagram.com/usuario" style={{ fontSize: isMobile ? 16 : 14 }} />
          </div>
        </div>
        <div style={{ background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>TikTok</div>
          <div className="form-row-2">
            <div className="fg">
              <label className="label">Usuario</label>
              <input className="input" value={form.tt_usuario}
                onChange={e => { setForm(f => ({ ...f, tt_usuario: e.target.value })); setDuplicateError(null) }}
                placeholder="@usuario" style={{ fontSize: isMobile ? 16 : 14 }} />
            </div>
            <div className="fg">
              <label className="label">Seguidores</label>
              <input className="input" type="number" value={form.tt_seguidores}
                onChange={e => setForm(f => ({ ...f, tt_seguidores: e.target.value }))}
                placeholder="0" style={{ fontSize: isMobile ? 16 : 14 }} />
            </div>
          </div>
          <div className="fg">
            <label className="label">Link de perfil</label>
            <input className="input" value={form.tt_link}
              onChange={e => setForm(f => ({ ...f, tt_link: e.target.value }))}
              placeholder="https://tiktok.com/@usuario" style={{ fontSize: isMobile ? 16 : 14 }} />
          </div>
        </div>
        <div className="fg">
          <label className="label">Categorías de contenido</label>
          <TiposCheckboxes selected={form.tipos_contenido} onChange={tipos => setForm(f => ({ ...f, tipos_contenido: tipos }))} categorias={categorias} />
          {form.tipos_contenido.length === 0 && <div style={{ fontSize: 11, color: '#CCC', marginTop: 4 }}>Selecciona al menos una categoría</div>}
        </div>
        <div className="fg">
          <label className="label">Estado</label>
          <select className="input" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
            style={{ fontSize: isMobile ? 16 : 14, minHeight: isMobile ? 44 : 'auto' }}>
            <option>Activo</option><option>Inactivo</option>
          </select>
        </div>
        <div className="fg">
          <label className="label">Notas internas</label>
          <textarea className="input" rows={2} value={form.notas}
            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Solo visible para el equipo..."
            style={{ resize: 'vertical', fontSize: isMobile ? 16 : 14 }} />
        </div>
        {duplicateError && (
          <div style={{ background: '#FCEBEB', border: '0.5px solid #F7C1C1', borderRadius: 8, padding: '10px 12px', marginBottom: 4, fontSize: 13, color: '#791F1F', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>⚠</span><span>{duplicateError} Busca el influencer existente para editarlo.</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn-ghost" onClick={() => { setModalOpen(false); setDuplicateError(null) }}>Cancelar</button>
          <button className="btn-red" onClick={handleSave} disabled={saving}
            style={{ minHeight: isMobile ? 44 : 'auto', minWidth: isMobile ? 100 : 'auto' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>

      {/* Modal eliminar */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Eliminar influencer">
        <p style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>¿Estás segura? Esta acción no se puede deshacer.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setDeleteId(null)}>Cancelar</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
        </div>
      </Modal>
    </div>
  )
}
