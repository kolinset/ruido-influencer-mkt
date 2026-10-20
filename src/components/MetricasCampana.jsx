import { useState, useEffect, useCallback } from 'react'
import { getMetricas } from '../lib/links'
import useIsMobile from '../lib/useIsMobile'

// Métricas de la campaña (leídas del reporte de Tokchart): tarjetas con totales y ranking de videos.
// Se usa en el portal del cliente, la propuesta y Roster. `onData` avisa los datos al padre
// (por ejemplo, para mostrar las views junto a cada influencer).

function fmt(n) {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'M'
  if (n >= 1e4) return Math.round(n / 1e3) + 'K'
  return n.toLocaleString('es-CL')
}
const exacto = n => (Number(n) || 0).toLocaleString('es-CL')

function haceCuanto(fecha) {
  if (!fecha) return ''
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

function Thumb({ id, size }) {
  const [falla, setFalla] = useState(false)
  if (falla || !id) return <div style={{ width: size * 0.5625, height: size, borderRadius: 8, background: '#F2EDE6', flexShrink: 0 }} />
  return <img src={`https://assets.tokchart.com/video_thumbnails/${id}`} alt="" loading="lazy" onError={() => setFalla(true)}
    style={{ width: size * 0.5625, height: size, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: '#F2EDE6' }} />
}

export default function MetricasCampana({ campaignId, admin = false, onData }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const [red, setRed] = useState('total') // 'total' | 'tiktok' | 'instagram'

  const cargar = useCallback(async (forzar = false) => {
    try {
      const d = await getMetricas(campaignId, forzar)
      setData(d); setError('')
      onData?.(d)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLoading(true); setData(null); cargar() }, [cargar])

  async function actualizarAhora() {
    setActualizando(true)
    await cargar(true)
    setActualizando(false)
  }

  if (loading) return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: 22, marginBottom: 16, color: '#AAA', fontSize: 13 }}>
      Cargando métricas…
    </div>
  )
  if (error || !data?.disponible) {
    if (!admin) return null
    return (
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontSize: 12.5, color: '#888' }}>
        {error ? `No se pudieron cargar las métricas: ${error}` : 'Las métricas aparecen solas cuando la campaña tiene su reporte de Tokchart.'}
      </div>
    )
  }

  // Con reporte de TikTok y de Instagram se puede ver el total o cada red por separado
  const redes = ['tiktok', 'instagram'].filter(k => data.plataformas[k])
  const ambas = redes.length > 1
  const vista = ambas && red !== 'total' && data.plataformas[red] ? red : 'total'
  const t = vista === 'total' ? data.total : data.plataformas[vista]
  const engagement = vista === 'total' ? data.engagement : data.plataformas[vista].engagement
  const posts = Object.entries(data.plataformas)
    .filter(([plat]) => vista === 'total' || plat === vista)
    .flatMap(([plat, p]) => (p.posts || []).map(x => ({ ...x, plat })))
    .sort((a, b) => (b.views || 0) - (a.views || 0))
  const visibles = verTodos ? posts : posts.slice(0, 10)
  const maxViews = posts[0]?.views || 1

  const kpis = [
    ['Views', t.views, true],
    ['Likes', t.likes],
    ['Comentarios', t.comments],
    ['Compartidos', t.shares],
    ['Guardados', t.saves],
  ]

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>Métricas de la campaña{vista !== 'total' ? ` · ${vista === 'tiktok' ? 'TikTok' : 'Instagram'}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: '#AAA' }}>
          <span>Actualizado {haceCuanto(data.actualizado)}</span>
          {admin && <button className="btn-ghost" style={{ fontSize: 11.5, padding: '5px 12px' }} onClick={actualizarAhora} disabled={actualizando}>{actualizando ? 'Actualizando…' : '↻ Actualizar ahora'}</button>}
        </div>
      </div>

      {data.aviso && <div style={{ fontSize: 12, color: '#633806', background: '#FAEEDA', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>{data.aviso}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
        {kpis.map(([label, valor, grande]) => (
          <div key={label} style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 16px', }}>
            <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: grande ? (isMobile ? 26 : 30) : (isMobile ? 20 : 22), fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1, color: grande ? '#C4501A' : undefined }}>{fmt(valor)}</div>
            <div style={{ fontSize: 10.5, color: '#BBB', marginTop: 5 }}>{fmt(valor) !== exacto(valor) ? exacto(valor) : 'total'}</div>
          </div>
        ))}
        {engagement != null && (
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Engagement</div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1 }}>{Number(engagement).toFixed(2).replace('.', ',')}%</div>
            <div style={{ fontSize: 10.5, color: '#BBB', marginTop: 5 }}>promedio</div>
          </div>
        )}
      </div>

      {/* Selector Total / TikTok / Instagram (solo si la campaña tiene reporte en las dos redes) */}
      {ambas && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {[['total', 'Total', data.total.views], ...redes.map(k => [k, k === 'tiktok' ? 'TikTok' : 'Instagram', data.plataformas[k].views])].map(([k, label, v]) => {
            const activo = vista === k
            return (
              <button key={k} onClick={() => { setRed(k); setVerTodos(false) }} style={{
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 12, padding: isMobile ? '10px 12px' : '11px 14px',
                background: activo ? 'linear-gradient(180deg, rgba(229, 138, 62, 0.16), rgba(196, 80, 26, 0.10))' : '#fff',
                border: activo ? '1.5px solid #C4501A' : '0.5px solid #E5E5E2',
                boxShadow: activo ? '0 6px 16px rgba(196, 80, 26, 0.12)' : 'none', transition: 'all .15s',
              }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: activo ? '#C4501A' : '#888', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 600, letterSpacing: '-.02em', color: activo ? '#1A1A1A' : '#555' }}>{fmt(v)} <span style={{ fontSize: 10.5, fontWeight: 400, color: '#AAA' }}>views</span></div>
              </button>
            )
          })}
        </div>
      )}

      {posts.length > 0 && (
        <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: isMobile ? '12px 14px' : '14px 18px', borderBottom: '0.5px solid #F0F0EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Ranking de videos <span style={{ color: '#AAA', fontWeight: 400 }}>· {posts.length}</span></div>
            <div style={{ fontSize: 11, color: '#AAA' }}>por views</div>
          </div>
          {visibles.map((p, i) => (
            <div key={p.plat + p.video_id} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, padding: isMobile ? '10px 14px' : '10px 18px', borderBottom: i < visibles.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>
              <div style={{
                width: 26, height: 26, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11.5, fontWeight: 600,
                background: i < 3 ? 'linear-gradient(145deg, #E58A3E, #C4501A)' : '#F2EDE6', color: i < 3 ? '#fff' : '#8A7F76',
              }}>{i + 1}</div>
              <Thumb id={p.plat === 'tiktok' ? p.video_id : null} size={isMobile ? 44 : 52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ambas && vista === 'total' && <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 4, marginRight: 6, verticalAlign: 1, background: p.plat === 'tiktok' ? '#1A1A1A' : '#FDE8F0', color: p.plat === 'tiktok' ? '#fff' : '#C2185B' }}>{p.plat === 'tiktok' ? 'TT' : 'IG'}</span>}
                  {p.handle ? '@' + p.handle : 'Video'}
                </div>
                <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                  {isMobile
                    ? `${exacto(p.likes)} likes${p.engagement != null ? ` · ${String(p.engagement).replace('.', ',')}%` : ''}`
                    : `${p.followers ? `${fmt(p.followers)} seguidores · ` : ''}${exacto(p.likes)} likes${p.engagement != null ? ` · ${String(p.engagement).replace('.', ',')}% eng.` : ''}`}
                </div>
                <div style={{ height: 4, background: '#F2EDE6', borderRadius: 2, marginTop: 6, overflow: 'hidden', maxWidth: 260 }}>
                  <div style={{ height: '100%', width: Math.max(3, Math.round((p.views || 0) / maxViews * 100)) + '%', background: 'linear-gradient(90deg, #C4501A, #E58A3E)', borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em' }}>{fmt(p.views)}</div>
                <div style={{ fontSize: 10, color: '#AAA' }}>views</div>
              </div>
              {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: '#C4501A', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>{isMobile ? '↗' : 'Ver ↗'}</a>}
            </div>
          ))}
          {posts.length > 10 && (
            <div style={{ padding: 10, textAlign: 'center', borderTop: '0.5px solid #F0F0EE' }}>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setVerTodos(v => !v)}>{verTodos ? 'Ver menos' : `Ver todos (${posts.length})`}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
