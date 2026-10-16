import { useState, useEffect } from 'react'
import sql from '../lib/db'

const ESTADO_CAMP_COLORS = {
  Activa:    { bg: '#EAF3DE', color: '#27500A' },
  Pausada:   { bg: '#FAEEDA', color: '#633806' },
  Cerrada:   { bg: '#E6F1FB', color: '#0C447C' },
  Cancelada: { bg: '#FCEBEB', color: '#791F1F' },
}

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

export default function ClienteDashboard({ client, onBack, onOpenCampaign }) {
  const [camps, setCamps] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [filterAnio, setFilterAnio] = useState('')
  const [sortOrder, setSortOrder] = useState('reciente')
  const [clientToken, setClientToken] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { fetchData() }, [client.id])

  async function fetchData() {
    setLoading(true)
    try {
      const [campsData, tokenData] = await Promise.all([
        sql`
          SELECT
            c.*,
            COUNT(DISTINCT ci.id) AS total_influencers,
            COUNT(DISTINCT CASE WHEN ci.video_link_tt != '' OR ci.video_link_ig != '' THEN ci.id END) AS videos_publicados
          FROM campaigns c
          LEFT JOIN campaign_influencers ci ON ci.campaign_id = c.id
          WHERE c.client_id = ${client.id}
          GROUP BY c.id
          ORDER BY c.created_at DESC
        `,
        sql`
          SELECT * FROM client_tokens
          WHERE client_id = ${client.id} AND activo = true
          LIMIT 1
        `
      ])
      setCamps(campsData)
      if (tokenData.length > 0) {
        setClientToken(tokenData[0])
      } else {
        const token = crypto.randomUUID()
        const created = await sql`
          INSERT INTO client_tokens (client_id, token)
          VALUES (${client.id}, ${token})
          RETURNING *
        `
        setClientToken(created[0])
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function regenerateToken() {
    const token = crypto.randomUUID()
    await sql`UPDATE client_tokens SET token = ${token} WHERE id = ${clientToken.id}`
    setClientToken({ ...clientToken, token })
  }

  async function toggleToken() {
    await sql`UPDATE client_tokens SET activo = ${!clientToken.activo} WHERE id = ${clientToken.id}`
    setClientToken({ ...clientToken, activo: !clientToken.activo })
  }

  async function copyLink() {
    const url = `${window.location.origin}/?clientDashboard=${clientToken.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copia este link:', url)
    }
  }

  const anios = [...new Set(camps.map(c => c.created_at ? new Date(c.created_at).getFullYear() : null).filter(Boolean))].sort((a, b) => b - a)

  const filtered = camps
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !q || c.nombre.toLowerCase().includes(q) ||
        (c.artista || '').toLowerCase().includes(q) ||
        (c.cancion || '').toLowerCase().includes(q)
      const matchEstado = !filterEstado || c.estado === filterEstado
      const matchAnio = !filterAnio || (c.created_at && new Date(c.created_at).getFullYear() === parseInt(filterAnio))
      return matchSearch && matchEstado && matchAnio
    })
    .sort((a, b) => {
      if (sortOrder === 'reciente') return new Date(b.created_at) - new Date(a.created_at)
      return new Date(a.created_at) - new Date(b.created_at)
    })

  // KPIs
  const totalCamps = camps.length
  const activas = camps.filter(c => c.estado === 'Activa').length
  const cerradas = camps.filter(c => c.estado === 'Cerrada').length
  const totalInfluencers = camps.reduce((s, c) => s + Number(c.total_influencers), 0)
  const totalVideos = camps.reduce((s, c) => s + Number(c.videos_publicados), 0)

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#AAA', cursor: 'pointer', marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={onBack}>
          ← Volver a clientes
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: client.color || '#C4501A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: '#fff',
          }}>
            {client.nombre?.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500 }}>{client.nombre}</h1>
            <p style={{ fontSize: 12, color: '#AAA', marginTop: 2 }}>{totalCamps} campañas</p>
          </div>
        </div>
      </div>

      {/* Link compartible */}
      {clientToken && (
        <div style={{
          background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12,
          padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Dashboard del cliente</div>
            <span style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 20,
              background: clientToken.activo ? '#EAF3DE' : '#F1EFE8',
              color: clientToken.activo ? '#27500A' : '#5F5E5A',
            }}>{clientToken.activo ? 'Activo' : 'Desactivado'}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#F7F7F5', border: '0.5px solid #E5E5E2',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          }}>
            <span style={{ flex: 1, fontSize: 12, color: '#666', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {window.location.origin}/?clientDashboard={clientToken.token}
            </span>
            <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12, flexShrink: 0 }} onClick={copyLink}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={toggleToken}>
              {clientToken.activo ? 'Desactivar' : 'Activar'}
            </button>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={regenerateToken}>
              Regenerar link
            </button>
            <a href={`${window.location.origin}/?clientDashboard=${clientToken.token}`}
              target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: 'auto', fontSize: 12, color: client.color || '#C4501A', textDecoration: 'none' }}>
              Vista previa ↗
            </a>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total campañas', value: totalCamps },
          { label: 'Activas', value: activas, color: activas > 0 ? '#27500A' : undefined },
          { label: 'Finalizadas', value: cerradas },
          { label: 'Influencers', value: totalInfluencers },
          { label: 'Videos publicados', value: totalVideos },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: color || '#1A1A1A' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Buscar campaña, artista..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 280 }} />
        <select className="input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option>Activa</option><option>Pausada</option>
          <option>Cerrada</option><option>Cancelada</option>
        </select>
        <select className="input" value={filterAnio} onChange={e => setFilterAnio(e.target.value)}>
          <option value="">Todos los años</option>
          {anios.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
          <option value="reciente">Más reciente</option>
          <option value="antigua">Más antigua</option>
        </select>
      </div>

      {/* Tabla de campañas */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
          {search || filterEstado || filterAnio ? 'Sin resultados' : 'Este cliente no tiene campañas aún.'}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                  <th className="th" style={{ minWidth: 200 }}>Campaña</th>
                  <th className="th" style={{ minWidth: 120 }}>Artista</th>
                  <th className="th" style={{ minWidth: 100 }}>Estado</th>
                  <th className="th" style={{ minWidth: 100 }}>Inicio</th>
                  <th className="th" style={{ minWidth: 100 }}>Término</th>
                  <th className="th" style={{ minWidth: 90 }}>Influencers</th>
                  <th className="th" style={{ minWidth: 80 }}>Videos</th>
                  <th className="th" style={{ minWidth: 70 }}>Plataforma</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(camp => {
                  const ec = ESTADO_CAMP_COLORS[camp.estado] || ESTADO_CAMP_COLORS['Activa']
                  return (
                    <tr key={camp.id}
                      style={{ borderBottom: '0.5px solid #F0F0EE', cursor: 'pointer' }}
                      onClick={() => onOpenCampaign(camp)}
                      onMouseEnter={e => e.currentTarget.style.background = '#F7F7F5'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="td">
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{camp.nombre}</div>
                        {camp.cancion && <div style={{ fontSize: 11, color: '#AAA', fontStyle: 'italic' }}>"{camp.cancion}"</div>}
                      </td>
                      <td className="td" style={{ fontSize: 13, color: '#555' }}>{camp.artista || '—'}</td>
                      <td className="td">
                        <span style={{ background: ec.bg, color: ec.color, padding: '2px 9px', borderRadius: 20, fontSize: 11 }}>
                          {camp.estado}
                        </span>
                      </td>
                      <td className="td" style={{ fontSize: 12, color: '#888' }}>
                        {camp.fecha_inicio ? new Date(camp.fecha_inicio).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td className="td" style={{ fontSize: 12, color: '#888' }}>
                        {camp.fecha_termino ? new Date(camp.fecha_termino).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td className="td" style={{ fontWeight: 500 }}>{camp.total_influencers}</td>
                      <td className="td" style={{ color: '#555' }}>{camp.videos_publicados}</td>
                      <td className="td">
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: '#F0F0EE', color: '#555' }}>
                          {camp.plataforma || 'Ambas'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
