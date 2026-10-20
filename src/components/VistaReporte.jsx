import { useState, useEffect } from 'react'
import { publicSql } from '../lib/db'
import Logo from './Logo'
import useIsMobile from '../lib/useIsMobile'

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

function fmtNum(n) {
  n = Number(n) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
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
    }}>{nombre?.[0]?.toUpperCase()}</div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
      borderRadius: 12, padding: '16px 18px',
    }}>
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, color: '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function MetricPill({ label, value, good }) {
  return (
    <div style={{
      background: '#F7F7F5', border: '0.5px solid #E5E5E2',
      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 18, fontWeight: 500, color: good ? '#3B6D11' : '#1A1A1A' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#AAA', marginTop: 3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    </div>
  )
}

function PlatBadge({ plataforma }) {
  const isTT = plataforma === 'TikTok'
  return (
    <span style={{
      fontSize: 10.5, padding: '2px 7px', borderRadius: 20,
      background: isTT ? '#F0F0EE' : '#FEF0FB',
      color: isTT ? '#555' : '#6B1560',
    }}>{plataforma}</span>
  )
}

export default function VistaReporte({ token }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('resumen')
  const [platFilter, setPlatFilter] = useState('Todas')

  useEffect(() => { if (token) fetchReport(token) }, [token])

  async function fetchReport(t) {
    setLoading(true)
    try {
      const tokenData = await publicSql('reportePorToken', t)
      if (tokenData.length === 0) {
        const check = await publicSql('reporteTokenExiste', t)
        setError(check.length === 0 ? 'not_found' : 'inactive')
        setLoading(false)
        return
      }

      const campInfo = tokenData[0]

      const postsData = await publicSql('postsDeReporte', campInfo.campaign_id)

      const grouped = {}
      postsData.forEach(row => {
        if (!grouped[row.id]) {
          grouped[row.id] = {
            id: row.id, plataforma: row.plataforma, url: row.url,
            fecha_publicacion: row.fecha_publicacion,
            inf_nombre: row.inf_nombre,
            ig_usuario: row.ig_usuario, tt_usuario: row.tt_usuario,
            ig_seguidores: row.ig_seguidores, tt_seguidores: row.tt_seguidores,
            tipos_contenido: row.tipos_contenido || [],
            influencer_id: row.influencer_id,
            metrics: [],
          }
        }
        if (row.pm_id) {
          grouped[row.id].metrics.push({
            id: row.pm_id,
            views: Number(row.views), likes: Number(row.likes),
            comentarios: Number(row.comentarios), shares: Number(row.shares),
            saves: Number(row.saves), engagement_rate: Number(row.engagement_rate),
            fecha_registro: row.fecha_registro,
          })
        }
      })

      const posts = Object.values(grouped).map(p => ({
        ...p,
        latest: p.metrics.sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro))[0] || null,
      }))

      // Detectar plataformas disponibles
      const plataformas = [...new Set(posts.map(p => p.plataforma))].filter(Boolean)

      setData({ camp: campInfo, posts, plataformas })
    } catch (e) { console.error(e); setError('error') }
    setLoading(false)
  }

  if (loading) return (
    <div className="glass-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: '#AAA' }}>Cargando reporte...</div>
    </div>
  )

  if (error) return (
    <div className="glass-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#AAA' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#555', marginBottom: 6 }}>
          {error === 'not_found' ? 'Reporte no encontrado' : error === 'inactive' ? 'Este reporte ha sido desactivado' : 'Error al cargar'}
        </div>
        <div style={{ fontSize: 13 }}>Contacta a tu agencia para obtener acceso.</div>
      </div>
    </div>
  )

  const { camp, posts, plataformas } = data

  // Filtrar posts por plataforma seleccionada
  const filteredPosts = platFilter === 'Todas'
    ? posts
    : posts.filter(p => p.plataforma === platFilter)

  const postsConMetricas = filteredPosts.filter(p => p.latest)

  const totals = postsConMetricas.reduce((acc, p) => ({
    views: acc.views + p.latest.views,
    likes: acc.likes + p.latest.likes,
    comentarios: acc.comentarios + p.latest.comentarios,
    shares: acc.shares + p.latest.shares,
    saves: acc.saves + p.latest.saves,
  }), { views: 0, likes: 0, comentarios: 0, shares: 0, saves: 0 })

  const avgER = postsConMetricas.length > 0
    ? (postsConMetricas.reduce((s, p) => s + p.latest.engagement_rate, 0) / postsConMetricas.length).toFixed(2)
    : 0

  // Por influencer (de posts filtrados)
  const byInf = {}
  filteredPosts.forEach(p => {
    if (!byInf[p.influencer_id]) {
      byInf[p.influencer_id] = {
        nombre: p.inf_nombre, posts: 0, views: 0, likes: 0,
        comentarios: 0, shares: 0, saves: 0,
        tipos_contenido: p.tipos_contenido,
        index: Object.keys(byInf).length,
      }
    }
    byInf[p.influencer_id].posts++
    if (p.latest) {
      byInf[p.influencer_id].views += p.latest.views
      byInf[p.influencer_id].likes += p.latest.likes
      byInf[p.influencer_id].comentarios += p.latest.comentarios
      byInf[p.influencer_id].shares += p.latest.shares
      byInf[p.influencer_id].saves += p.latest.saves
    }
  })
  const infList = Object.values(byInf).sort((a, b) => b.views - a.views)
  const maxViews = Math.max(...postsConMetricas.map(p => p.latest.views), 1)

  const thStyle = {
    padding: '11px 16px', textAlign: 'left', fontSize: 10.5,
    fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: '#AAA',
    background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2',
  }
  const tdStyle = { padding: '12px 16px', fontSize: 13, verticalAlign: 'middle', borderBottom: '0.5px solid #F0F0EE' }

  // Tabs de plataforma — solo mostrar si hay más de una
  const showPlatTabs = plataformas.length > 1
  const platTabs = ['Todas', ...plataformas]

  return (
    <div className="glass-app" style={{ minHeight: '100vh', paddingBottom: 8 }}>

      {/* Header */}
      <div className="portal-hero" style={{ margin: isMobile ? 10 : '16px 24px 0', padding: isMobile ? '20px 18px' : '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Logo height={18} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '.05em' }}>— Reporte de campaña</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, color: '#fff', marginBottom: 4 }}>{camp.camp_nombre}</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{camp.cliente}</p>
          </div>
          {/* Selector de plataforma en el header */}
          {showPlatTabs && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {platTabs.map(p => {
                const isActive = platFilter === p
                const isTT = p === 'TikTok'
                const isIG = p === 'Instagram'
                return (
                  <button
                    key={p}
                    onClick={() => setPlatFilter(p)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12.5, cursor: 'pointer',
                      border: isActive ? 'none' : '0.5px solid rgba(255,255,255,0.2)',
                      background: isActive
                        ? isTT ? '#F0F0EE' : isIG ? '#FEF0FB' : '#C4501A'
                        : 'transparent',
                      color: isActive
                        ? isTT ? '#555' : isIG ? '#6B1560' : '#fff'
                        : 'rgba(255,255,255,0.6)',
                      fontFamily: 'inherit',
                      transition: 'all .15s',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          <StatCard label="Publicaciones" value={filteredPosts.length} sub={`${infList.length} influencers`} />
          <StatCard label="Views totales" value={fmtNum(totals.views)} />
          <StatCard label="Likes totales" value={fmtNum(totals.likes)} />
          <StatCard label="Comentarios" value={fmtNum(totals.comentarios)} />
          <StatCard label="Eng. Rate prom." value={avgER + '%'} sub="promedio de posts" />
        </div>
      </div>

      <div style={{ padding: isMobile ? '18px 14px' : '24px 40px' }}>

        {/* Tabs de contenido */}
        <div style={{ display: 'flex', gap: 2, background: '#EBEBEB', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content', border: '0.5px solid #E0E0E0' }}>
          {['resumen', 'por influencer', 'publicaciones'].map(t => (
            <div key={t} onClick={() => setActiveTab(t)} style={{
              padding: '7px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
              background: activeTab === t ? '#fff' : 'transparent',
              color: activeTab === t ? '#1A1A1A' : '#888',
              boxShadow: activeTab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              border: activeTab === t ? '0.5px solid #E5E5E2' : '0.5px solid transparent',
              textTransform: 'capitalize',
            }}>{t}</div>
          ))}
        </div>

        {/* Aviso si no hay posts con métricas */}
        {filteredPosts.length === 0 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#AAA', fontSize: 13 }}>
            No hay publicaciones para {platFilter === 'Todas' ? 'esta campaña' : platFilter} aún.
          </div>
        )}

        {/* RESUMEN */}
        {activeTab === 'resumen' && filteredPosts.length > 0 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              <MetricPill label="Shares" value={fmtNum(totals.shares)} />
              <MetricPill label="Saves" value={fmtNum(totals.saves)} />
              <MetricPill label="ER promedio" value={avgER + '%'} good={parseFloat(avgER) >= 2} />
            </div>

            {postsConMetricas.length > 0 && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
                  Top posts por views
                  {platFilter !== 'Todas' && <span style={{ fontSize: 12, fontWeight: 400, color: '#AAA', marginLeft: 8 }}>— {platFilter}</span>}
                </div>
                <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
                  {postsConMetricas
                    .sort((a, b) => b.latest.views - a.latest.views)
                    .slice(0, 6)
                    .map((p, i) => {
                      const pct = Math.round((p.latest.views / maxViews) * 100)
                      return (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px',
                          borderBottom: i < 5 ? '0.5px solid #F0F0EE' : 'none',
                        }}>
                          <span style={{ fontSize: 11, color: '#CCC', width: 16, flexShrink: 0 }}>{i + 1}</span>
                          <Avatar nombre={p.inf_nombre} index={i} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{p.inf_nombre}</span>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{fmtNum(p.latest.views)} views</span>
                                <span style={{
                                  fontSize: 10.5, padding: '2px 8px', borderRadius: 20,
                                  background: p.latest.engagement_rate >= 3 ? '#EAF3DE' : p.latest.engagement_rate >= 1 ? '#FAEEDA' : '#F1EFE8',
                                  color: p.latest.engagement_rate >= 3 ? '#27500A' : p.latest.engagement_rate >= 1 ? '#633806' : '#5F5E5A',
                                }}>{p.latest.engagement_rate}% ER</span>
                                <PlatBadge plataforma={p.plataforma} />
                              </div>
                            </div>
                            <div style={{ height: 4, background: '#F0F0EE', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: pct + '%', background: '#C4501A', borderRadius: 2 }} />
                            </div>
                          </div>
                          {p.url && (
                            <a href={p.url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 12, color: '#C4501A', textDecoration: 'none', flexShrink: 0 }}>
                              Ver ↗
                            </a>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* POR INFLUENCER */}
        {activeTab === 'por influencer' && filteredPosts.length > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Influencer</th>
                    <th style={thStyle}>Categorías</th>
                    <th style={thStyle}>Posts</th>
                    <th style={thStyle}>Views</th>
                    <th style={thStyle}>Likes</th>
                    <th style={thStyle}>Comentarios</th>
                    <th style={thStyle}>Shares</th>
                    <th style={thStyle}>Saves</th>
                  </tr>
                </thead>
                <tbody>
                  {infList.map((inf, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nombre={inf.nombre} index={inf.index} />
                          <span style={{ fontWeight: 500 }}>{inf.nombre}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(inf.tipos_contenido || []).slice(0, 2).map(t => {
                            const c = TIPO_COLORS[t] || TIPO_COLORS['Otros']
                            return <span key={t} style={{ background: c.bg, color: c.color, padding: '1px 7px', borderRadius: 20, fontSize: 11 }}>{t}</span>
                          })}
                        </div>
                      </td>
                      <td style={tdStyle}>{inf.posts}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{fmtNum(inf.views)}</td>
                      <td style={tdStyle}>{fmtNum(inf.likes)}</td>
                      <td style={tdStyle}>{fmtNum(inf.comentarios)}</td>
                      <td style={tdStyle}>{fmtNum(inf.shares)}</td>
                      <td style={tdStyle}>{fmtNum(inf.saves)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PUBLICACIONES */}
        {activeTab === 'publicaciones' && filteredPosts.length > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Influencer</th>
                    <th style={thStyle}>Plataforma</th>
                    <th style={thStyle}>Fecha</th>
                    <th style={thStyle}>Views</th>
                    <th style={thStyle}>Likes</th>
                    <th style={thStyle}>Comentarios</th>
                    <th style={thStyle}>Shares</th>
                    <th style={thStyle}>Saves</th>
                    <th style={thStyle}>ER%</th>
                    <th style={thStyle}>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((p, i) => (
                    <tr key={p.id}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar nombre={p.inf_nombre} index={i} size={26} />
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{p.inf_nombre}</span>
                        </div>
                      </td>
                      <td style={tdStyle}><PlatBadge plataforma={p.plataforma} /></td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#888' }}>
                        {p.fecha_publicacion ? new Date(p.fecha_publicacion).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{p.latest ? fmtNum(p.latest.views) : <span style={{ color: '#CCC' }}>—</span>}</td>
                      <td style={tdStyle}>{p.latest ? fmtNum(p.latest.likes) : <span style={{ color: '#CCC' }}>—</span>}</td>
                      <td style={tdStyle}>{p.latest ? fmtNum(p.latest.comentarios) : <span style={{ color: '#CCC' }}>—</span>}</td>
                      <td style={tdStyle}>{p.latest ? fmtNum(p.latest.shares) : <span style={{ color: '#CCC' }}>—</span>}</td>
                      <td style={tdStyle}>{p.latest ? fmtNum(p.latest.saves) : <span style={{ color: '#CCC' }}>—</span>}</td>
                      <td style={tdStyle}>
                        {p.latest ? (
                          <span style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 20,
                            background: p.latest.engagement_rate >= 3 ? '#EAF3DE' : p.latest.engagement_rate >= 1 ? '#FAEEDA' : '#F1EFE8',
                            color: p.latest.engagement_rate >= 3 ? '#27500A' : p.latest.engagement_rate >= 1 ? '#633806' : '#5F5E5A',
                          }}>{p.latest.engagement_rate}%</span>
                        ) : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#C4501A', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                          >Ver ↗</a>
                        ) : <span style={{ color: '#CCC' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: '#CCC' }}>
          Reporte generado por <Logo height={10} dark style={{ opacity: 0.4 }} />
        </div>
      </div>
    </div>
  )
}
