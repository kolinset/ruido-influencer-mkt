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

const AV_COLORS = [
  { bg: '#F4D3AE', color: '#8A2E0C' },
  { bg: '#F6DCC4', color: '#3A1608' },
  { bg: '#F9C99A', color: '#8A2E0C' },
  { bg: '#EFD9C8', color: '#C4501A' },
  { bg: '#F2C3A0', color: '#3A1608' },
  { bg: '#FBE6CF', color: '#C4501A' },
  { bg: '#E9C6A8', color: '#3A1608' },
  { bg: '#F7D9B8', color: '#8A2E0C' },
]

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function fmtMoney(n, moneda) {
  n = Math.round(Number(n))
  if (moneda === 'USD') return '$' + n.toLocaleString('en-US')
  return '$' + n.toLocaleString('es-CL')
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

function KPI({ label, value, sub, subColor }) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E5E5E2',
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ fontSize: 11, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, color: '#1A1A1A', lineHeight: 1, letterSpacing: '-.03em' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: subColor || '#AAA', marginTop: 6 }}>{sub}</div>
      )}
    </div>
  )
}

function BudgetBar({ usado, total, moneda }) {
  const pct = total > 0 ? Math.min(100, Math.round((usado / total) * 100)) : 0
  const barColor = pct >= 100 ? '#E24B4A' : pct >= 90 ? '#EF9F27' : '#639922'
  const textColor = pct >= 100 ? '#A32D2D' : pct >= 90 ? '#854F0B' : '#3B6D11'
  const bgColor = pct >= 100 ? '#FCEBEB' : pct >= 90 ? '#FAEEDA' : '#EAF3DE'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 11, background: bgColor, color: textColor, padding: '1px 7px', borderRadius: 20 }}>
          {pct}% usado
        </span>
        <span style={{ fontSize: 11, color: '#AAA' }}>
          {fmtMoney(usado, moneda)} / {fmtMoney(total, moneda)}
        </span>
      </div>
      <div style={{ height: 4, background: '#F0F0EE', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: barColor, borderRadius: 2 }} />
      </div>
    </div>
  )
}

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchDashboard() }, [])

  async function fetchDashboard() {
    setLoading(true)
    try {
      const [infRows, campRows, ciRows, pagoRows] = await Promise.all([
        sql`
          SELECT id, nombre, ig_seguidores, tt_seguidores, tipos_contenido, estado
          FROM influencers
          ORDER BY tt_seguidores DESC
        `,
        sql`SELECT * FROM campaigns ORDER BY created_at DESC`,
        sql`SELECT campaign_id, influencer_id, costo, tipo_facturacion FROM campaign_influencers`,
        sql`
          SELECT
            i.id AS influencer_id,
            i.nombre,
            json_agg(json_build_object(
              'costo', ci.costo,
              'tipo_facturacion', ci.tipo_facturacion
            )) AS pagos_raw
          FROM influencers i
          JOIN campaign_influencers ci ON ci.influencer_id = i.id
          JOIN campaigns c ON c.id = ci.campaign_id
          WHERE ci.estado_pago != 'Pagado'
            AND ci.costo > 0
            AND c.estado IN ('Activa', 'Cerrada')
          GROUP BY i.id, i.nombre
        `,
      ])

      const now = new Date()
      const mesActual = now.getMonth()
      const anioActual = now.getFullYear()

      const campsConDatos = campRows.map(c => {
        const infs = ciRows.filter(ci => ci.campaign_id === c.id)
        const usado = infs.reduce((s, i) => s + calcCosto(i.costo, i.tipo_facturacion), 0)
        const creado = new Date(c.created_at)
        const esMes = creado.getMonth() === mesActual && creado.getFullYear() === anioActual
        return { ...c, usado, esMes }
      })

      const pagosPendientes = pagoRows.map(r => {
        const pagos = r.pagos_raw || []
        const total = pagos.reduce((s, p) => s + calcCosto(p.costo, p.tipo_facturacion), 0)
        return { ...r, total_pendiente: total }
      }).filter(r => r.total_pendiente > 0)

      const totalPendiente = pagosPendientes.reduce((s, p) => s + p.total_pendiente, 0)

      setData({
        influencers: infRows,
        campaigns: campsConDatos,
        totalSegTT: infRows.reduce((s, i) => s + Number(i.tt_seguidores), 0),
        activos: infRows.filter(i => i.estado === 'Activo').length,
        pagosPendientes,
        totalPendiente,
        countPendientes: pagosPendientes.length,
      })
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#AAA', fontSize: 13 }}>Cargando...</div>
  if (!data) return null

  const campsMes = data.campaigns.filter(c => c.esMes)
  const topInfs = data.influencers.slice(0, 8)
  const mesNombre = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  return (
    <div style={{ padding: '20px 24px' }}>

      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: '#AAA', marginTop: 2 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPI label="Influencers en roster" value={data.influencers.length} sub={`${data.activos} activos`} subColor="#3B6D11" />
        <KPI label="Campañas totales" value={data.campaigns.length} sub={`${campsMes.length} este mes`} subColor="#0C447C" />
        <KPI label="Alcance TikTok roster" value={fmtSeg(data.totalSegTT)} sub="seguidores TikTok acumulados" />
        <KPI label="Presupuesto administrado" value={fmtMoney(data.campaigns.reduce((s, c) => s + Number(c.budget), 0), 'CLP')} sub="en todas las campañas" />
      </div>

      {/* Tarjeta pagos pendientes */}
      {data.countPendientes > 0 && (
        <div
          onClick={() => onNavigate('pagos-globales')}
          style={{
            background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12,
            padding: '16px 20px', marginBottom: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#C4501A'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E2'; e.currentTarget.style.transform = 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FCEBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⏳</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Pagos pendientes a influencers</div>
              <div style={{ fontSize: 12, color: '#888' }}>{data.countPendientes} influencer{data.countPendientes !== 1 ? 's' : ''} por pagar</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 500, color: '#A32D2D' }}>{fmtMoney(data.totalPendiente, 'CLP')}</div>
              <div style={{ fontSize: 11, color: '#AAA' }}>total por pagar</div>
            </div>
            <span style={{ fontSize: 20, color: '#CCC' }}>›</span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500 }}>Top influencers TikTok</h2>
            <span style={{ fontSize: 12, color: '#C4501A', cursor: 'pointer' }} onClick={() => onNavigate('roster')}>Ver roster →</span>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
            {topInfs.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Aún no hay influencers en el roster.</div>
            ) : topInfs.map((inf, i) => (
              <div key={inf.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < topInfs.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>
                <span style={{ fontSize: 11, color: '#CCC', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <Avatar nombre={inf.nombre} index={i} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inf.nombre}</div>
                  <div style={{ fontSize: 11, color: '#AAA' }}>IG {fmtSeg(inf.ig_seguidores)}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtSeg(inf.tt_seguidores)}</div>
                  <div style={{ fontSize: 10, color: '#CCC' }}>TikTok</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 500 }}>Campañas — {mesNombre}</h2>
            <span style={{ fontSize: 12, color: '#C4501A', cursor: 'pointer' }} onClick={() => onNavigate('campanas')}>Ver todas →</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campsMes.length === 0 ? (
              <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: 32, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
                No hay campañas creadas este mes.
              </div>
            ) : campsMes.map(camp => (
              <div key={camp.id} className="card" style={{ padding: '14px 16px', cursor: 'pointer', transition: 'border-color .15s' }}
                onClick={() => onNavigate('campanas')}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#C4501A'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E5E2'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, flex: 1, paddingRight: 8 }}>{camp.nombre}</div>
                  <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 20, flexShrink: 0, background: camp.estado === 'Activa' ? '#EAF3DE' : '#F1EFE8', color: camp.estado === 'Activa' ? '#27500A' : '#5F5E5A' }}>
                    {camp.estado}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#AAA', marginBottom: 8 }}>{camp.cliente}</div>
                <BudgetBar usado={camp.usado} total={Number(camp.budget)} moneda={camp.moneda} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
