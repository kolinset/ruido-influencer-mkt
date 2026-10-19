import { useState, useEffect } from 'react'
import sql from '../lib/db'
import Modal from './Modal'

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

function fmtNum(n) {
  n = Number(n) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function Avatar({ nombre, index, size = 28 }) {
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

function MetricCard({ label, value, sub, icon }) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E5E5E2',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: '#1A1A1A' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#AAA', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function MiniBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: '#F0F0EE', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: '#C4501A', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: '#AAA', width: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

const EMPTY_POST = { plataforma: 'TikTok', url: '', fecha_publicacion: '', descripcion: '' }
const EMPTY_METRICS = { views: '', likes: '', comentarios: '', shares: '', saves: '', engagement_rate: '' }
const PLATAFORMAS_POST = ['TikTok', 'Instagram']

export default function Reportes({ camp, roster }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [reportToken, setReportToken] = useState(null)
  const [copied, setCopied] = useState(false)

  const [modalPost, setModalPost] = useState(false)
  const [postForm, setPostForm] = useState(EMPTY_POST)
  const [editPostId, setEditPostId] = useState(null)
  const [savingPost, setSavingPost] = useState(false)

  const [modalMetrics, setModalMetrics] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [metricsForm, setMetricsForm] = useState(EMPTY_METRICS)
  const [savingMetrics, setSavingMetrics] = useState(false)

  const [deletePostId, setDeletePostId] = useState(null)
  const [activeTab, setActiveTab] = useState('resumen')

  useEffect(() => {
    fetchPosts()
    fetchReportToken()
  }, [camp.id])

  async function fetchPosts() {
    setLoading(true)
    try {
      const data = await sql`
        SELECT
          p.*,
          i.nombre AS inf_nombre,
          i.ig_seguidores, i.tt_seguidores,
          pm.id AS pm_id,
          pm.views, pm.likes, pm.comentarios,
          pm.shares, pm.saves, pm.engagement_rate,
          pm.fecha_registro, pm.fuente
        FROM posts p
        JOIN influencers i ON i.id = p.influencer_id
        LEFT JOIN post_metrics pm ON pm.post_id = p.id
        WHERE p.campaign_id = ${camp.id}
        ORDER BY p.fecha_publicacion DESC NULLS LAST, p.created_at DESC
      `
      // Agrupar métricas por post (puede haber múltiples snapshots)
      const grouped = {}
      data.forEach(row => {
        if (!grouped[row.id]) {
          grouped[row.id] = {
            id: row.id, campaign_id: row.campaign_id,
            influencer_id: row.influencer_id,
            inf_nombre: row.inf_nombre,
            ig_seguidores: row.ig_seguidores,
            tt_seguidores: row.tt_seguidores,
            plataforma: row.plataforma, url: row.url,
            fecha_publicacion: row.fecha_publicacion,
            descripcion: row.descripcion,
            metrics: [],
          }
        }
        if (row.pm_id) {
          grouped[row.id].metrics.push({
            id: row.pm_id,
            views: Number(row.views), likes: Number(row.likes),
            comentarios: Number(row.comentarios), shares: Number(row.shares),
            saves: Number(row.saves), engagement_rate: Number(row.engagement_rate),
            fecha_registro: row.fecha_registro, fuente: row.fuente,
          })
        }
      })
      setPosts(Object.values(grouped))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function fetchReportToken() {
    try {
      const data = await sql`
        SELECT * FROM report_tokens
        WHERE campaign_id = ${camp.id} AND activo = true
        LIMIT 1
      `
      if (data.length > 0) setReportToken(data[0])
      else {
        // Crear token automáticamente
        const token = crypto.randomUUID()
        const created = await sql`
          INSERT INTO report_tokens (campaign_id, token)
          VALUES (${camp.id}, ${token})
          RETURNING *
        `
        setReportToken(created[0])
      }
    } catch (e) { console.error(e) }
  }

  async function savePost() {
    if (!postForm.url.trim()) return
    setSavingPost(true)
    try {
      // Encontrar influencer_id desde camp
      const infInCamp = camp.influencers.find(i => i.influencer_id)
      if (editPostId) {
        await sql`
          UPDATE posts SET
            plataforma = ${postForm.plataforma},
            url = ${postForm.url},
            fecha_publicacion = ${postForm.fecha_publicacion || null},
            descripcion = ${postForm.descripcion}
          WHERE id = ${editPostId}
        `
      } else {
        await sql`
          INSERT INTO posts (campaign_id, influencer_id, plataforma, url, fecha_publicacion, descripcion)
          VALUES (
            ${camp.id}, ${postForm.influencer_id},
            ${postForm.plataforma}, ${postForm.url},
            ${postForm.fecha_publicacion || null},
            ${postForm.descripcion}
          )
        `
      }
      setModalPost(false)
      setPostForm(EMPTY_POST)
      setEditPostId(null)
      await fetchPosts()
    } catch (e) { console.error(e) }
    setSavingPost(false)
  }

  async function deletePost(id) {
    try {
      await sql`DELETE FROM posts WHERE id = ${id}`
      setDeletePostId(null)
      await fetchPosts()
    } catch (e) { console.error(e) }
  }

  async function saveMetrics() {
    if (!selectedPost) return
    setSavingMetrics(true)
    try {
      const seg = selectedPost.plataforma === 'TikTok'
        ? Number(selectedPost.tt_seguidores)
        : Number(selectedPost.ig_seguidores)
      const likes = parseInt(metricsForm.likes) || 0
      const comentarios = parseInt(metricsForm.comentarios) || 0
      const shares = parseInt(metricsForm.shares) || 0
      const saves = parseInt(metricsForm.saves) || 0
      const views = parseInt(metricsForm.views) || 0
      const er = metricsForm.engagement_rate
        ? parseFloat(metricsForm.engagement_rate)
        : seg > 0 ? Math.round(((likes + comentarios + shares + saves) / seg) * 10000) / 100 : 0

      await sql`
        INSERT INTO post_metrics (post_id, views, likes, comentarios, shares, saves, engagement_rate, fuente)
        VALUES (${selectedPost.id}, ${views}, ${likes}, ${comentarios}, ${shares}, ${saves}, ${er}, 'manual')
      `
      setModalMetrics(false)
      setMetricsForm(EMPTY_METRICS)
      setSelectedPost(null)
      await fetchPosts()
    } catch (e) { console.error(e) }
    setSavingMetrics(false)
  }

  async function toggleReportToken() {
    if (!reportToken) return
    try {
      await sql`UPDATE report_tokens SET activo = ${!reportToken.activo} WHERE id = ${reportToken.id}`
      setReportToken({ ...reportToken, activo: !reportToken.activo })
    } catch (e) { console.error(e) }
  }

  async function regenerateToken() {
    try {
      const token = crypto.randomUUID()
      await sql`UPDATE report_tokens SET token = ${token} WHERE id = ${reportToken.id}`
      setReportToken({ ...reportToken, token })
    } catch (e) { console.error(e) }
  }

  async function copyReportLink() {
    const url = `${window.location.origin}/?report=${reportToken.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copia este link:', url)
    }
  }

  // Calcular métricas agregadas (último snapshot de cada post)
  const latestMetrics = posts.map(p => {
    const m = p.metrics.sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro))[0]
    return { ...p, latest: m || null }
  })

  const totals = latestMetrics.reduce((acc, p) => {
    if (!p.latest) return acc
    return {
      views: acc.views + p.latest.views,
      likes: acc.likes + p.latest.likes,
      comentarios: acc.comentarios + p.latest.comentarios,
      shares: acc.shares + p.latest.shares,
      saves: acc.saves + p.latest.saves,
    }
  }, { views: 0, likes: 0, comentarios: 0, shares: 0, saves: 0 })

  const postsConMetricas = latestMetrics.filter(p => p.latest)
  const avgER = postsConMetricas.length > 0
    ? (postsConMetricas.reduce((s, p) => s + p.latest.engagement_rate, 0) / postsConMetricas.length).toFixed(2)
    : 0

  const maxViews = Math.max(...latestMetrics.map(p => p.latest?.views || 0), 1)

  // Métricas por influencer
  const byInfluencer = {}
  latestMetrics.forEach(p => {
    if (!byInfluencer[p.influencer_id]) {
      byInfluencer[p.influencer_id] = {
        nombre: p.inf_nombre, posts: 0,
        views: 0, likes: 0, comentarios: 0, shares: 0, saves: 0,
        index: Object.keys(byInfluencer).length,
      }
    }
    byInfluencer[p.influencer_id].posts++
    if (p.latest) {
      byInfluencer[p.influencer_id].views += p.latest.views
      byInfluencer[p.influencer_id].likes += p.latest.likes
      byInfluencer[p.influencer_id].comentarios += p.latest.comentarios
      byInfluencer[p.influencer_id].shares += p.latest.shares
      byInfluencer[p.influencer_id].saves += p.latest.saves
    }
  })
  const infList = Object.values(byInfluencer).sort((a, b) => b.views - a.views)

  if (loading) return <div style={{ padding: 20, color: '#AAA', fontSize: 13 }}>Cargando reportes...</div>

  return (
    <div>
      {/* Link compartible */}
      {reportToken && (
        <div style={{
          background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12,
          padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Link del reporte</div>
            <span style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 20,
              background: reportToken.activo ? '#EAF3DE' : '#F1EFE8',
              color: reportToken.activo ? '#27500A' : '#5F5E5A',
            }}>
              {reportToken.activo ? 'Activo' : 'Desactivado'}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#F7F7F5', border: '0.5px solid #E5E5E2',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          }}>
            <span style={{ flex: 1, fontSize: 12, color: '#666', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {window.location.origin}/?report={reportToken.token}
            </span>
            <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12, flexShrink: 0 }} onClick={copyReportLink}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={toggleReportToken}>
              {reportToken.activo ? 'Desactivar' : 'Activar'}
            </button>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={regenerateToken}>
              Regenerar link
            </button>
            <a
              href={`${window.location.origin}/?report=${reportToken.token}`}
              target="_blank" rel="noopener noreferrer"
              style={{ marginLeft: 'auto', fontSize: 12, color: '#C4501A', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Vista previa ↗
            </a>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#F0F0EE', borderRadius: 10, padding: 3, marginBottom: 20, width: 'fit-content', border: '0.5px solid #E5E5E2' }}>
        {['resumen', 'publicaciones', 'por influencer'].map(t => (
          <div key={t} onClick={() => setActiveTab(t)} style={{
            padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
            background: activeTab === t ? '#fff' : 'transparent',
            color: activeTab === t ? '#1A1A1A' : '#888',
            boxShadow: activeTab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            border: activeTab === t ? '0.5px solid #E5E5E2' : '0.5px solid transparent',
            textTransform: 'capitalize',
          }}>
            {t}
          </div>
        ))}
      </div>

      {/* TAB: RESUMEN */}
      {activeTab === 'resumen' && (
        <div>
          {posts.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#AAA', fontSize: 13 }}>
              No hay publicaciones cargadas aún. Agrega posts para ver métricas.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                <MetricCard label="Publicaciones" value={posts.length} sub={`${camp.influencers.length} influencers`} />
                <MetricCard label="Views totales" value={fmtNum(totals.views)} />
                <MetricCard label="Likes totales" value={fmtNum(totals.likes)} />
                <MetricCard label="Eng. Rate prom." value={avgER + '%'} sub="promedio de posts" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                <MetricCard label="Comentarios" value={fmtNum(totals.comentarios)} />
                <MetricCard label="Shares" value={fmtNum(totals.shares)} />
                <MetricCard label="Saves" value={fmtNum(totals.saves)} />
                <MetricCard label="Con métricas" value={postsConMetricas.length + '/' + posts.length} sub="posts con datos" />
              </div>

              {/* Top posts por views */}
              {postsConMetricas.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Top posts por views</div>
                  <div className="card" style={{ overflow: 'hidden' }}>
                    {latestMetrics
                      .filter(p => p.latest)
                      .sort((a, b) => b.latest.views - a.latest.views)
                      .slice(0, 5)
                      .map((p, i) => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                          borderBottom: i < 4 ? '0.5px solid #F0F0EE' : 'none',
                        }}>
                          <span style={{ fontSize: 11, color: '#CCC', width: 14, flexShrink: 0 }}>{i + 1}</span>
                          <Avatar nombre={p.inf_nombre} index={i} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.inf_nombre}</div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                              <MiniBar value={p.latest.views} max={maxViews} />
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{fmtNum(p.latest.views)}</div>
                            <div style={{ fontSize: 10.5, color: '#AAA' }}>{p.latest.engagement_rate}% ER</div>
                          </div>
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 20,
                            background: p.plataforma === 'TikTok' ? '#F0F0EE' : '#FEF0FB',
                            color: p.plataforma === 'TikTok' ? '#555' : '#6B1560',
                            flexShrink: 0,
                          }}>{p.plataforma}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: PUBLICACIONES */}
      {activeTab === 'publicaciones' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-red" onClick={() => {
              setPostForm({ ...EMPTY_POST, influencer_id: camp.influencers[0]?.influencer_id || '' })
              setEditPostId(null)
              setModalPost(true)
            }}>+ Agregar publicación</button>
          </div>

          {posts.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#AAA', fontSize: 13 }}>
              No hay publicaciones. Agrega el primer post.
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                      <th className="th" style={{ width: 160 }}>Influencer</th>
                      <th className="th" style={{ width: 80 }}>Plataforma</th>
                      <th className="th" style={{ width: 90 }}>Fecha</th>
                      <th className="th" style={{ width: 80 }}>Views</th>
                      <th className="th" style={{ width: 70 }}>Likes</th>
                      <th className="th" style={{ width: 80 }}>Comentarios</th>
                      <th className="th" style={{ width: 70 }}>Shares</th>
                      <th className="th" style={{ width: 60 }}>Saves</th>
                      <th className="th" style={{ width: 70 }}>ER%</th>
                      <th className="th" style={{ width: 80 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestMetrics.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                        <td className="td">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar nombre={p.inf_nombre} index={i} size={24} />
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.inf_nombre}</div>
                              {p.url && (
                                <a href={p.url} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: 10.5, color: '#C4501A', textDecoration: 'none' }}>
                                  Ver post ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="td">
                          <span style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 20,
                            background: p.plataforma === 'TikTok' ? '#F0F0EE' : '#FEF0FB',
                            color: p.plataforma === 'TikTok' ? '#555' : '#6B1560',
                          }}>{p.plataforma}</span>
                        </td>
                        <td className="td" style={{ fontSize: 12, color: '#888' }}>
                          {p.fecha_publicacion ? new Date(p.fecha_publicacion).toLocaleDateString('es-CL') : '—'}
                        </td>
                        <td className="td" style={{ fontWeight: 500 }}>{p.latest ? fmtNum(p.latest.views) : <span style={{ color: '#CCC' }}>—</span>}</td>
                        <td className="td">{p.latest ? fmtNum(p.latest.likes) : <span style={{ color: '#CCC' }}>—</span>}</td>
                        <td className="td">{p.latest ? fmtNum(p.latest.comentarios) : <span style={{ color: '#CCC' }}>—</span>}</td>
                        <td className="td">{p.latest ? fmtNum(p.latest.shares) : <span style={{ color: '#CCC' }}>—</span>}</td>
                        <td className="td">{p.latest ? fmtNum(p.latest.saves) : <span style={{ color: '#CCC' }}>—</span>}</td>
                        <td className="td">
                          {p.latest ? (
                            <span style={{
                              fontSize: 11, padding: '2px 7px', borderRadius: 20,
                              background: p.latest.engagement_rate >= 3 ? '#EAF3DE' : p.latest.engagement_rate >= 1 ? '#FAEEDA' : '#F1EFE8',
                              color: p.latest.engagement_rate >= 3 ? '#27500A' : p.latest.engagement_rate >= 1 ? '#633806' : '#5F5E5A',
                            }}>{p.latest.engagement_rate}%</span>
                          ) : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                        </td>
                        <td className="td">
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button className="btn-icon" style={{ fontSize: 11, padding: '3px 8px', width: 'auto', height: 'auto', borderRadius: 6 }}
                              onClick={() => { setSelectedPost(p); setMetricsForm(EMPTY_METRICS); setModalMetrics(true) }}
                              title="Cargar métricas">
                              +M
                            </button>
                            <button className="btn-icon btn-icon-danger" onClick={() => setDeletePostId(p.id)} title="Eliminar">✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: POR INFLUENCER */}
      {activeTab === 'por influencer' && (
        <div>
          {infList.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#AAA', fontSize: 13 }}>
              No hay datos por influencer aún.
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                      <th className="th" style={{ width: 180 }}>Influencer</th>
                      <th className="th" style={{ width: 70 }}>Posts</th>
                      <th className="th" style={{ width: 90 }}>Views</th>
                      <th className="th" style={{ width: 80 }}>Likes</th>
                      <th className="th" style={{ width: 90 }}>Comentarios</th>
                      <th className="th" style={{ width: 80 }}>Shares</th>
                      <th className="th" style={{ width: 70 }}>Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {infList.map((inf, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                        <td className="td">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar nombre={inf.nombre} index={inf.index} />
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{inf.nombre}</span>
                          </div>
                        </td>
                        <td className="td" style={{ color: '#888' }}>{inf.posts}</td>
                        <td className="td" style={{ fontWeight: 500 }}>{fmtNum(inf.views)}</td>
                        <td className="td">{fmtNum(inf.likes)}</td>
                        <td className="td">{fmtNum(inf.comentarios)}</td>
                        <td className="td">{fmtNum(inf.shares)}</td>
                        <td className="td">{fmtNum(inf.saves)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal agregar publicación */}
      <Modal open={modalPost} onClose={() => setModalPost(false)} title={editPostId ? 'Editar publicación' : 'Nueva publicación'}>
        <div className="fg">
          <label className="label">Influencer</label>
          <select className="input" value={postForm.influencer_id || ''}
            onChange={e => setPostForm(f => ({ ...f, influencer_id: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {camp.influencers.map(inf => (
              <option key={inf.influencer_id} value={inf.influencer_id}>{inf.nombre}</option>
            ))}
          </select>
        </div>
        <div className="form-row-2">
          <div className="fg">
            <label className="label">Plataforma</label>
            <select className="input" value={postForm.plataforma}
              onChange={e => setPostForm(f => ({ ...f, plataforma: e.target.value }))}>
              {PLATAFORMAS_POST.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="label">Fecha publicación</label>
            <input className="input" type="date" value={postForm.fecha_publicacion}
              onChange={e => setPostForm(f => ({ ...f, fecha_publicacion: e.target.value }))} />
          </div>
        </div>
        <div className="fg">
          <label className="label">URL del post</label>
          <input className="input" value={postForm.url}
            onChange={e => setPostForm(f => ({ ...f, url: e.target.value }))}
            placeholder="https://tiktok.com/..." />
        </div>
        <div className="fg">
          <label className="label">Descripción (opcional)</label>
          <textarea className="input" rows={2} value={postForm.descripcion}
            onChange={e => setPostForm(f => ({ ...f, descripcion: e.target.value }))}
            style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn-ghost" onClick={() => setModalPost(false)}>Cancelar</button>
          <button className="btn-red" onClick={savePost} disabled={savingPost || !postForm.influencer_id || !postForm.url}>
            {savingPost ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>

      {/* Modal cargar métricas */}
      <Modal open={modalMetrics} onClose={() => setModalMetrics(false)} title={`Métricas — ${selectedPost?.inf_nombre}`}>
        {selectedPost && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10.5, padding: '2px 7px', borderRadius: 20,
              background: selectedPost.plataforma === 'TikTok' ? '#F0F0EE' : '#FEF0FB',
              color: selectedPost.plataforma === 'TikTok' ? '#555' : '#6B1560',
            }}>{selectedPost.plataforma}</span>
            {selectedPost.url && (
              <a href={selectedPost.url} target="_blank" rel="noopener noreferrer"
                style={{ color: '#C4501A', fontSize: 12, textDecoration: 'none' }}>
                Ver post ↗
              </a>
            )}
            {selectedPost.metrics.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#AAA' }}>
                {selectedPost.metrics.length} snapshot{selectedPost.metrics.length > 1 ? 's' : ''} anterior{selectedPost.metrics.length > 1 ? 'es' : ''}
              </span>
            )}
          </div>
        )}
        <div className="form-row-2">
          <div className="fg">
            <label className="label">Views</label>
            <input className="input" type="number" value={metricsForm.views}
              onChange={e => setMetricsForm(f => ({ ...f, views: e.target.value }))} placeholder="0" />
          </div>
          <div className="fg">
            <label className="label">Likes</label>
            <input className="input" type="number" value={metricsForm.likes}
              onChange={e => setMetricsForm(f => ({ ...f, likes: e.target.value }))} placeholder="0" />
          </div>
        </div>
        <div className="form-row-2">
          <div className="fg">
            <label className="label">Comentarios</label>
            <input className="input" type="number" value={metricsForm.comentarios}
              onChange={e => setMetricsForm(f => ({ ...f, comentarios: e.target.value }))} placeholder="0" />
          </div>
          <div className="fg">
            <label className="label">Shares</label>
            <input className="input" type="number" value={metricsForm.shares}
              onChange={e => setMetricsForm(f => ({ ...f, shares: e.target.value }))} placeholder="0" />
          </div>
        </div>
        <div className="form-row-2">
          <div className="fg">
            <label className="label">Saves</label>
            <input className="input" type="number" value={metricsForm.saves}
              onChange={e => setMetricsForm(f => ({ ...f, saves: e.target.value }))} placeholder="0" />
          </div>
          <div className="fg">
            <label className="label">ER% (opcional, se calcula solo)</label>
            <input className="input" type="number" step="0.01" value={metricsForm.engagement_rate}
              onChange={e => setMetricsForm(f => ({ ...f, engagement_rate: e.target.value }))} placeholder="Auto" />
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#AAA', marginBottom: 12 }}>
          Si no ingresas el ER%, se calcula automáticamente sobre los seguidores del influencer.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setModalMetrics(false)}>Cancelar</button>
          <button className="btn-red" onClick={saveMetrics} disabled={savingMetrics}>
            {savingMetrics ? 'Guardando...' : 'Guardar métricas'}
          </button>
        </div>
      </Modal>

      {/* Modal confirmar eliminar post */}
      <Modal open={!!deletePostId} onClose={() => setDeletePostId(null)} title="Eliminar publicación">
        <p style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>
          ¿Eliminar esta publicación y todas sus métricas?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setDeletePostId(null)}>Cancelar</button>
          <button className="btn-danger" onClick={() => deletePost(deletePostId)}>Eliminar</button>
        </div>
      </Modal>
    </div>
  )
}
