import { useState, useEffect } from 'react'
import supabase from '../lib/supabaseClient'
import { resumenDiario } from '../lib/links'

const RETENCION_HONORARIOS = 0.1525
const IVA = 0.19

function calcCosto(base, tipo) {
  const b = Number(base) || 0
  if (tipo === 'honorarios')  return Math.round(b / (1 - RETENCION_HONORARIOS))
  if (tipo === 'factura_iva') return Math.round(b * (1 + IVA))
  return b
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
      <div style={{ fontSize: 'clamp(20px, 2.5vw, 30px)', fontWeight: 600, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-.03em', whiteSpace: 'nowrap' }}>{value}</div>
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
  const [resumenBusy, setResumenBusy] = useState('')

  useEffect(() => { fetchDashboard() }, [])

  async function fetchDashboard() {
    setLoading(true)
    try {
      // Un solo pedido con las cuentas ya hechas en el servidor (antes eran 4 pedidos grandes)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/dashboard', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'No se pudo cargar el dashboard')
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, color: '#AAA', fontSize: 13 }}>Cargando...</div>
  if (!data) return null

  const campsMes = data.campsMes
  const topInfs = data.topInfs
  const mesNombre = new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  return (
    <div className="page-pad">

      <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: '#AAA', marginTop: 2 }}>
            {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {/* Resumen diario por mail: se envía solo cada mañana; acá se puede ver o enviar al momento */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} disabled={!!resumenBusy} onClick={async () => {
            const w = window.open('', '_blank')
            setResumenBusy('ver')
            try { const html = await resumenDiario(true); w.document.open(); w.document.write(html); w.document.close() }
            catch (e) { w?.close(); alert(e.message) }
            setResumenBusy('')
          }}>{resumenBusy === 'ver' ? 'Armando…' : '✉ Ver resumen de hoy'}</button>
          <button className="btn-ghost" style={{ fontSize: 12 }} disabled={!!resumenBusy} onClick={async () => {
            if (!confirm('¿Enviar ahora el resumen por mail?')) return
            setResumenBusy('enviar')
            try { const r = await resumenDiario(false); alert(`Resumen enviado a ${r.enviadoA.join(', ')}`) }
            catch (e) { alert('No se pudo enviar: ' + e.message) }
            setResumenBusy('')
          }}>{resumenBusy === 'enviar' ? 'Enviando…' : 'Enviar ahora'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPI label="Influencers en roster" value={data.totalInfluencers} sub={`${data.activos} activos`} subColor="#3B6D11" />
        <KPI label="Campañas totales" value={data.totalCampanas} sub={`${campsMes.length} este mes`} subColor="#0C447C" />
        <KPI label="Alcance TikTok roster" value={fmtSeg(data.totalSegTT)} sub="seguidores TikTok acumulados" />
        <KPI label="Presupuesto administrado" value={fmtMoney(data.budgetTotal, 'CLP')} sub="en todas las campañas" />
      </div>

      {/* Tarjeta pagos pendientes */}
      {data.countPendientes > 0 && (
        <div
          onClick={() => onNavigate('pagos-globales')}
          style={{
            background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12,
            padding: '16px 20px', marginBottom: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
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
