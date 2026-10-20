import { useState, useEffect } from 'react'
import sql from '../lib/db'

const RETENCION_HONORARIOS = 0.1525
const IVA = 0.19

function calcCosto(base, tipo) {
  const b = Number(base) || 0
  if (tipo === 'honorarios')  return Math.round(b / (1 - RETENCION_HONORARIOS))
  if (tipo === 'factura_iva') return Math.round(b * (1 + IVA))
  return b
}

function fmtMoney(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
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

const ESTADO_PAGO_COLORS = {
  Pendiente:         { bg: '#F1EFE8', color: '#5F5E5A' },
  'Boleta recibida': { bg: '#FAEEDA', color: '#633806' },
  Pagado:            { bg: '#EAF3DE', color: '#27500A' },
}

function Avatar({ nombre, index, size = 36 }) {
  const c = AV_COLORS[index % AV_COLORS.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c.bg, color: c.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 500, flexShrink: 0,
      border: '0.5px solid rgba(0,0,0,0.06)',
    }}>{nombre?.[0]?.toUpperCase()}</div>
  )
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

export default function PagosGlobales({ onBack }) {
  const isMobile = useIsMobile()
  const [pendientes, setPendientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // influencer seleccionado
  const [detalle, setDetalle] = useState([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [savingPago, setSavingPago] = useState(null) // ci_id en proceso
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('mayor') // mayor | menor | reciente | antiguo

  useEffect(() => { fetchPendientes() }, [])

  async function fetchPendientes() {
    setLoading(true)
    try {
      const rows = await sql`
        SELECT
          i.id AS influencer_id,
          i.nombre,
          i.tt_usuario,
          i.tt_seguidores,
          i.tt_link,
          i.ig_usuario,
          SUM(calcCosto_approx(ci.costo, ci.tipo_facturacion)) AS total_pendiente_raw,
          COUNT(ci.id) AS count_pendientes
        FROM influencers i
        JOIN campaign_influencers ci ON ci.influencer_id = i.id
        WHERE ci.estado_pago != 'Pagado'
          AND ci.costo > 0
        GROUP BY i.id, i.nombre, i.tt_usuario, i.tt_seguidores, i.tt_link, i.ig_usuario
        ORDER BY total_pendiente_raw DESC
      `
      setPendientes(rows)
    } catch (e) {
      // Fallback: calcular en JS si no existe la función SQL
      try {
        const rows = await sql`
          SELECT
            i.id AS influencer_id,
            i.nombre,
            i.tt_usuario,
            i.tt_seguidores,
            i.tt_link,
            i.ig_usuario,
            json_agg(json_build_object(
              'ci_id', ci.id,
              'costo', ci.costo,
              'tipo_facturacion', ci.tipo_facturacion
            )) AS pagos_raw
          FROM influencers i
          JOIN campaign_influencers ci ON ci.influencer_id = i.id
          JOIN campaigns c ON c.id = ci.campaign_id
          WHERE ci.estado_pago != 'Pagado'
            AND ci.costo > 0
            AND c.estado IN ('Activa', 'Cerrada')
          GROUP BY i.id, i.nombre, i.tt_usuario, i.tt_seguidores, i.tt_link, i.ig_usuario
        `
        const processed = rows.map(r => {
          const pagos = r.pagos_raw || []
          const total = pagos.reduce((s, p) => s + calcCosto(p.costo, p.tipo_facturacion), 0)
          return { ...r, total_pendiente: total, count_pendientes: pagos.length }
        })
        setPendientes(processed)
      } catch (e2) { console.error(e2) }
    }
    setLoading(false)
  }

  async function fetchDetalle(infId) {
    setLoadingDetalle(true)
    try {
      const rows = await sql`
        SELECT
          ci.id AS ci_id,
          ci.costo,
          ci.tipo_facturacion,
          ci.estado_pago,
          ci.link_boleta,
          c.id AS camp_id,
          c.nombre AS camp_nombre,
          c.cliente,
          c.created_at AS camp_fecha,
          c.moneda,
          c.estado AS camp_estado
        FROM campaign_influencers ci
        JOIN campaigns c ON c.id = ci.campaign_id
        WHERE ci.influencer_id = ${infId}
          AND ci.estado_pago != 'Pagado'
          AND ci.costo > 0
          AND c.estado IN ('Activa', 'Cerrada')
        ORDER BY c.created_at DESC
      `
      setDetalle(rows)
    } catch (e) { console.error(e) }
    setLoadingDetalle(false)
  }

  function openDetalle(inf, index) {
    setSelected({ ...inf, index })
    fetchDetalle(inf.influencer_id)
  }

  async function marcarPagado(ciId) {
    setSavingPago(ciId)
    try {
      await sql`
        UPDATE campaign_influencers
        SET estado_pago = 'Pagado'
        WHERE id = ${ciId}
      `
      // Actualizar detalle local
      setDetalle(prev => prev.filter(d => d.ci_id !== ciId))
      // Si ya no tiene pendientes, cerrar detalle y refrescar lista
      const remaining = detalle.filter(d => d.ci_id !== ciId)
      if (remaining.length === 0) {
        setSelected(null)
        setDetalle([])
      }
      // Refrescar lista global
      await fetchPendientes()
    } catch (e) { console.error(e) }
    setSavingPago(null)
  }

  // Totales generales
  const totalGeneral = pendientes.reduce((s, p) => {
    const total = p.total_pendiente != null
      ? Number(p.total_pendiente)
      : Number(p.total_pendiente_raw || 0)
    return s + total
  }, 0)

  const getTotal = (p) => p.total_pendiente != null
    ? Number(p.total_pendiente)
    : Number(p.total_pendiente_raw || 0)

  // Filtrar y ordenar
  const filtered = pendientes
    .filter(p => !search || p.nombre.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const ta = getTotal(a), tb = getTotal(b)
      if (sortOrder === 'mayor') return tb - ta
      if (sortOrder === 'menor') return ta - tb
      return 0
    })

  const totalDetalle = detalle.reduce((s, d) => s + calcCosto(d.costo, d.tipo_facturacion), 0)

  // ─── VISTA DETALLE DE INFLUENCER ───
  if (selected) {
    return (
      <div style={{ padding: isMobile ? '16px' : '20px 24px', maxWidth: 800 }}>
        <div style={{ fontSize: 12, color: '#AAA', cursor: 'pointer', marginBottom: 16 }}
          onClick={() => { setSelected(null); setDetalle([]) }}>
          ← Volver a pagos pendientes
        </div>

        {/* Header influencer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <Avatar nombre={selected.nombre} index={selected.index} size={isMobile ? 44 : 52} />
          <div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: 500 }}>{selected.nombre}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
              {selected.tt_usuario && (
                selected.tt_link
                  ? <a href={selected.tt_link} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#C4501A', textDecoration: 'none' }}>
                      TT: {selected.tt_usuario} ↗
                    </a>
                  : <span style={{ fontSize: 12, color: '#888' }}>TT: {selected.tt_usuario}</span>
              )}
              {selected.tt_seguidores > 0 && (
                <span style={{ fontSize: 12, color: '#AAA' }}>{fmtSeg(selected.tt_seguidores)} seguidores</span>
              )}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Total pendiente</div>
            <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(totalDetalle)}</div>
          </div>
        </div>

        {/* Lista de campañas pendientes */}
        {loadingDetalle ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
        ) : detalle.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13, background: '#F7F7F5', borderRadius: 12 }}>
            Sin pagos pendientes — todo al día ✓
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {detalle.map(d => {
              const costoFinal = calcCosto(d.costo, d.tipo_facturacion)
              const ep = ESTADO_PAGO_COLORS[d.estado_pago] || ESTADO_PAGO_COLORS['Pendiente']
              const isPaying = savingPago === d.ci_id
              return (
                <div key={d.ci_id} style={{
                  background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12,
                  padding: isMobile ? '14px' : '16px 20px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{d.camp_nombre}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#888' }}>
                        {d.cliente && <span>👤 {d.cliente}</span>}
                        <span>📅 {fmtDate(d.camp_fecha)}</span>
                        <span style={{ background: ep.bg, color: ep.color, padding: '1px 7px', borderRadius: 20, fontSize: 11 }}>
                          {d.estado_pago || 'Pendiente'}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 500 }}>{fmtMoney(costoFinal)}</div>
                      {d.tipo_facturacion && d.tipo_facturacion !== 'sin_recargo' && (
                        <div style={{ fontSize: 10.5, color: '#AAA', marginTop: 1 }}>
                          base {fmtMoney(d.costo)} · {d.tipo_facturacion === 'honorarios' ? 'Boleta' : 'Factura IVA'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {d.link_boleta && (
                      <a href={d.link_boleta} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: '#555', padding: '6px 12px', borderRadius: 8, border: '0.5px solid #E5E5E2', background: '#F7F7F5', textDecoration: 'none' }}>
                        Ver boleta ↗
                      </a>
                    )}
                    <button
                      onClick={() => marcarPagado(d.ci_id)}
                      disabled={isPaying}
                      style={{
                        fontSize: 12.5, padding: '6px 16px', borderRadius: 8,
                        background: isPaying ? '#F0F0EE' : '#EAF3DE',
                        color: isPaying ? '#AAA' : '#27500A',
                        border: `0.5px solid ${isPaying ? '#E5E5E2' : '#8BC34A'}`,
                        cursor: isPaying ? 'not-allowed' : 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      {isPaying ? 'Marcando...' : '✓ Marcar como pagado'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── VISTA LISTA ───
  return (
    <div style={{ padding: isMobile ? '16px' : '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 12, color: '#AAA', cursor: 'pointer', marginBottom: 4 }}
            onClick={onBack}>
            ← Dashboard
          </div>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 500 }}>Pagos pendientes</h1>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Total por pagar</div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(totalGeneral)}</div>
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Influencers pendientes</div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 500 }}>{filtered.length}</div>
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Promedio por influencer</div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 500 }}>
            {filtered.length > 0 ? fmtMoney(Math.round(totalGeneral / filtered.length)) : '—'}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Buscar influencer..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 280, minHeight: isMobile ? 42 : 'auto' }} />
        <select className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
          style={{ minHeight: isMobile ? 42 : 'auto' }}>
          <option value="mayor">Mayor monto primero</option>
          <option value="menor">Menor monto primero</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#555', marginBottom: 6 }}>
            {search ? 'Sin resultados' : '¡Todo al día!'}
          </div>
          <div style={{ fontSize: 13, color: '#AAA' }}>
            {search ? 'Intenta otra búsqueda.' : 'No hay pagos pendientes a influencers.'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((p, i) => {
                const total = getTotal(p)
                return (
                  <div key={p.influencer_id}
                    onClick={() => openDetalle(p, i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px', borderBottom: i < filtered.length - 1 ? '0.5px solid #F0F0EE' : 'none',
                      cursor: 'pointer',
                    }}>
                    <Avatar nombre={p.nombre} index={i} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: '#AAA' }}>
                        {p.count_pendientes} campaña{p.count_pendientes !== 1 ? 's' : ''} pendiente{p.count_pendientes !== 1 ? 's' : ''}
                        {p.tt_seguidores > 0 && <span> · {fmtSeg(p.tt_seguidores)} TT</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(total)}</div>
                    </div>
                    <span style={{ fontSize: 16, color: '#CCC' }}>›</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                  <th className="th" style={{ width: 240 }}>Influencer</th>
                  <th className="th" style={{ width: 120 }}>TikTok</th>
                  <th className="th" style={{ width: 100 }}>Campañas</th>
                  <th className="th" style={{ width: 160, textAlign: 'right' }}>Total pendiente</th>
                  <th className="th" style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const total = getTotal(p)
                  return (
                    <tr key={p.influencer_id}
                      onClick={() => openDetalle(p, i)}
                      style={{ borderBottom: '0.5px solid #F0F0EE', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F7F7F5'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nombre={p.nombre} index={i} size={32} />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</div>
                            {p.tt_usuario && <div style={{ fontSize: 11, color: '#AAA' }}>{p.tt_usuario}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <span style={{ fontSize: 13, color: '#555' }}>
                          {p.tt_seguidores > 0 ? fmtSeg(p.tt_seguidores) : '—'}
                        </span>
                      </td>
                      <td className="td">
                        <span style={{ fontSize: 13, color: '#888' }}>
                          {p.count_pendientes} pendiente{p.count_pendientes !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="td" style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(total)}</span>
                      </td>
                      <td className="td">
                        <span style={{ fontSize: 16, color: '#CCC' }}>›</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F7F7F5', borderTop: '0.5px solid #E5E5E2' }}>
                  <td className="td" colSpan={3}>
                    <span style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>{filtered.length} influencers</span>
                  </td>
                  <td className="td" style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(totalGeneral)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table></div>
          )}
        </div>
      )}
    </div>
  )
}
