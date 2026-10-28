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

function Thumb({ src, size }) {
  const [falla, setFalla] = useState(false)
  if (falla || !src) return <div style={{ width: size * 0.5625, height: size, borderRadius: 8, background: '#F2EDE6', flexShrink: 0 }} />
  return <img src={src} alt="" loading="lazy" onError={() => setFalla(true)}
    style={{ width: size * 0.5625, height: size, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: '#F2EDE6' }} />
}

// Para una canción de Social Boost se pasa `cancionId` en vez de `campaignId`.
// ───── Tabla de videos: todos los datos de cada video y orden por la columna que se elija ─────
const pctTxt = v => v == null ? '—' : Number(v).toFixed(2).replace('.', ',') + '%'
const fechaNum = f => { const t = Date.parse(f || ''); return Number.isFinite(t) ? t : null }
const sonidoDe = p => [p.cancion, p.artista].filter(Boolean).join(' - ')
const COLUMNAS = [
  { k: 'user', label: 'Usuario', val: p => (p.handle || '').toLowerCase(), texto: true },
  { k: 'sonido', label: 'Sonido', val: p => sonidoDe(p).toLowerCase() || null, ver: p => sonidoDe(p) || '—', texto: true, izq: true, mostrar: ps => ps.some(p => p.cancion) },
  { k: 'followers', label: 'Seguidores', val: p => p.followers, ver: p => p.followers ? fmt(p.followers) : '—' },
  { k: 'fecha', label: 'Subido', val: p => fechaNum(p.fecha), ver: p => p.fecha || '—' },
  { k: 'engagement', label: 'Engagement', val: p => p.engagement, ver: p => pctTxt(p.engagement) },
  { k: 'views', label: 'Views', val: p => p.views, ver: p => exacto(p.views), fuerte: true },
  { k: 'vxs', label: 'Views/Seg.', val: p => p.followers ? (p.views || 0) / p.followers * 100 : null, ver: p => p.followers ? pctTxt((p.views || 0) / p.followers * 100) : '—' },
  { k: 'likes', label: 'Likes', val: p => p.likes, ver: p => exacto(p.likes) },
  { k: 'comments', label: 'Comentarios', val: p => p.comments, ver: p => exacto(p.comments) },
  { k: 'saves', label: 'Guardados', val: p => p.saves, ver: p => p.saves == null ? '—' : exacto(p.saves), mostrar: ps => ps.some(p => p.saves != null) },
  { k: 'shares', label: 'Compartidos', val: p => p.shares, ver: p => exacto(p.shares) },
]

export function TablaVideos({ posts, isMobile, mostrarRed }) {
  const [orden, setOrden] = useState({ k: 'views', dir: 'desc' })
  const [verTodos, setVerTodos] = useState(false)
  // "Sonido" solo si los videos traen su canción (Social Boost → Cuentas); "Guardados" solo si algún
  // video lo trae (los reportes de Instagram no lo traen)
  const cols = COLUMNAS.filter(c => !c.mostrar || c.mostrar(posts))
  const col = cols.find(c => c.k === orden.k) || cols.find(c => c.k === 'views')
  const ordenados = [...posts].sort((a, b) => {
    const va = col.val(a), vb = col.val(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1            // los vacíos siempre al final
    if (vb == null) return -1
    const r = col.texto ? String(va).localeCompare(String(vb)) : va - vb
    return orden.dir === 'asc' ? r : -r
  })
  const visibles = verTodos ? ordenados : ordenados.slice(0, 10)
  const ordenarPor = k => setOrden(o => o.k === k ? { k, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { k, dir: k === 'user' ? 'asc' : 'desc' })
  const flecha = k => orden.k === k ? (orden.dir === 'desc' ? ' ↓' : ' ↑') : ''
  const thumbDe = p => p.thumb || (p.plat === 'tiktok' ? `https://assets.tokchart.com/video_thumbnails/${p.video_id}` : null)
  const red = p => mostrarRed && <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', borderRadius: 4, marginRight: 6, verticalAlign: 1, background: p.plat === 'tiktok' ? '#1A1A1A' : '#FDE8F0', color: p.plat === 'tiktok' ? '#fff' : '#C2185B' }}>{p.plat === 'tiktok' ? 'TT' : 'IG'}</span>

  return (
    <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: isMobile ? '12px 14px' : '14px 18px', borderBottom: '0.5px solid #F0F0EE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Videos <span style={{ color: '#AAA', fontWeight: 400 }}>· {posts.length}</span></div>
        {isMobile ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#AAA' }}>Ordenar por</span>
            <select className="input" style={{ width: 'auto', padding: '6px 8px', fontSize: 12.5 }} value={orden.k} onChange={e => setOrden({ k: e.target.value, dir: e.target.value === 'user' ? 'asc' : 'desc' })}>
              {cols.map(c => <option key={c.k} value={c.k}>{c.label}</option>)}
            </select>
            <button className="btn-ghost" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setOrden(o => ({ ...o, dir: o.dir === 'desc' ? 'asc' : 'desc' }))} title="Cambiar orden">{orden.dir === 'desc' ? '↓' : '↑'}</button>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#AAA' }}>Toca un título para ordenar</div>
        )}
      </div>

      {isMobile ? (
        visibles.map((p, i) => (
          <div key={p.plat + p.video_id} style={{ padding: '12px 14px', borderBottom: i < visibles.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Thumb src={thumbDe(p)} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{red(p)}{p.handle ? '@' + p.handle : 'Video'}</div>
                <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 2 }}>{[p.followers ? `${fmt(p.followers)} seguidores` : null, p.fecha].filter(Boolean).join(' · ')}</div>
                {p.cancion && <div style={{ fontSize: 11.5, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>♪ {sonidoDe(p)}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.02em' }}>{fmt(p.views)}</div>
                <div style={{ fontSize: 10, color: '#AAA' }}>views</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 10px', marginTop: 10 }}>
              {cols.filter(c => !['user', 'sonido', 'followers', 'fecha', 'views'].includes(c.k)).map(c => (
                <div key={c.k}>
                  <div style={{ fontSize: 9.5, color: orden.k === c.k ? '#C4501A' : '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: orden.k === c.k ? 600 : 500 }}>{c.ver(p)}</div>
                </div>
              ))}
            </div>
            {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, color: '#C4501A', textDecoration: 'none', fontWeight: 500 }}>Ver video ↗</a>}
          </div>
        ))
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                <th className="th" style={{ width: 24, padding: '10px 4px 10px 12px' }}>#</th>
                {cols.map(c => (
                  <th key={c.k} className="th" style={{ padding: '10px 7px', letterSpacing: 0, textTransform: 'none', fontSize: 11.5, textAlign: c.k === 'user' || c.izq ? 'left' : 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: orden.k === c.k ? '#C4501A' : undefined }}
                    onClick={() => ordenarPor(c.k)} title={`Ordenar por ${c.label.toLowerCase()}`}>
                    {c.label}{flecha(c.k)}
                  </th>
                ))}
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p, i) => (
                <tr key={p.plat + p.video_id} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                  <td className="td" style={{ color: '#AAA', padding: '9px 4px 9px 12px', fontSize: 12.5 }}>{i + 1}</td>
                  {cols.map(c => c.k === 'user' ? (
                    <td key={c.k} className="td" style={{ padding: '9px 7px', fontSize: 12.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Thumb src={thumbDe(p)} size={38} />
                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{red(p)}{p.handle ? '@' + p.handle : 'Video'}</span>
                      </div>
                    </td>
                  ) : c.izq ? (
                    <td key={c.k} className="td" style={{ padding: '9px 7px', fontSize: 12.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.ver(p)}>{c.ver(p)}</td>
                  ) : (
                    <td key={c.k} className="td" style={{ padding: '9px 7px', fontSize: 12.5, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: c.fuerte || orden.k === c.k ? 600 : 400 }}>{c.ver(p)}</td>
                  ))}
                  <td className="td" style={{ padding: '9px 10px 9px 4px' }}>{p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: '#C4501A', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>Ver ↗</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {posts.length > 10 && (
        <div style={{ padding: 10, textAlign: 'center', borderTop: '0.5px solid #F0F0EE' }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setVerTodos(v => !v)}>{verTodos ? 'Ver menos' : `Ver todos (${posts.length})`}</button>
        </div>
      )}
    </div>
  )
}

// Descarga los videos (y el total) en un CSV que abre bien en Excel en español: separado por ";",
// decimales con coma y con BOM para que se vean los tildes
function descargarCSV(posts, t, engagement, nombre) {
  const dec = v => v == null ? '' : Number(v).toFixed(2).replace('.', ',')
  const n = v => v == null ? '' : String(v)
  const celda = v => /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
  const filas = [
    ['Red', 'Usuario', 'Link', 'Seguidores', 'Subido', 'Engagement %', 'Views', 'Views/Seguidores %', 'Likes', 'Comentarios', 'Guardados', 'Compartidos'],
    ...posts.map(p => [p.plat === 'tiktok' ? 'TikTok' : 'Instagram', p.handle ? '@' + p.handle : '', p.link || '', n(p.followers), p.fecha || '',
      dec(p.engagement), n(p.views), p.followers ? dec((p.views || 0) / p.followers * 100) : '', n(p.likes), n(p.comments), n(p.saves), n(p.shares)]),
    ['Total', `${posts.length} videos`, '', '', '', dec(engagement), n(t.views), '', n(t.likes), n(t.comments), n(t.saves), n(t.shares)],
  ]
  const csv = '\uFEFF' + filas.map(f => f.map(x => celda(String(x))).join(';')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const hoy = new Date().toISOString().slice(0, 10)
  a.download = `${(nombre || 'metricas').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'metricas'} - ${hoy}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export default function MetricasCampana({ campaignId, cancionId, titulo = 'Métricas de la campaña', nombre = '', admin = false, onData }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actualizando, setActualizando] = useState(false)
  const [red, setRed] = useState('total') // 'total' | 'tiktok' | 'instagram'

  const cargar = useCallback(async (forzar = false) => {
    try {
      const d = await getMetricas(cancionId || campaignId, forzar, !!cancionId)
      setData(d); setError('')
      onData?.(d)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }, [campaignId, cancionId]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // Reportes que no se pudieron leer (solo se avisa dentro de Roster, no al cliente)
  const nombreRed = k => k === 'tiktok' ? 'TikTok' : 'Instagram'
  const avisoErrores = admin && data?.errores && Object.keys(data.errores).length
    ? Object.entries(data.errores).map(([k, e]) => `No se pudo leer el reporte de ${nombreRed(k)} en Tokchart (${e}). Se reintenta solo en unos minutos.`).join(' ')
    : ''

  if (error || !data?.disponible) {
    if (!admin) return null
    return (
      <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 18px', marginBottom: 16, fontSize: 12.5, color: avisoErrores ? '#633806' : '#888' }}>
        {error ? `No se pudieron cargar las métricas: ${error}` : avisoErrores || (cancionId ? 'Las métricas aparecen solas cuando la canción tiene su reporte de Tokchart (se crea al subir el primer video).' : 'Las métricas aparecen solas cuando la campaña tiene su reporte de Tokchart.')}
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

  const kpis = [
    ['Views', t.views, true],
    ['Likes', t.likes],
    ['Comentarios', t.comments],
    ['Compartidos', t.shares],
    // Los reportes de Instagram de Tokchart no traen "guardados"
    ...(vista === 'instagram' ? [] : [['Guardados', t.saves]]),
  ]

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em' }}>{titulo}{vista !== 'total' ? ` · ${vista === 'tiktok' ? 'TikTok' : 'Instagram'}` : ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: '#AAA' }}>
          <span>Actualizado {haceCuanto(data.actualizado)}</span>
          {posts.length > 0 && <button className="btn-ghost" style={{ fontSize: 11.5, padding: '5px 12px' }} onClick={() => descargarCSV(posts, t, engagement, nombre + (vista !== 'total' ? ` (${nombreRed(vista)})` : ''))} title="Descargar los videos y sus métricas para abrir en Excel">⬇ Descargar CSV</button>}
          {admin && <button className="btn-ghost" style={{ fontSize: 11.5, padding: '5px 12px' }} onClick={actualizarAhora} disabled={actualizando}>{actualizando ? 'Actualizando…' : '↻ Actualizar ahora'}</button>}
        </div>
      </div>

      {(avisoErrores || data.aviso) && <div style={{ fontSize: 12, color: '#633806', background: '#FAEEDA', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>{avisoErrores || data.aviso}</div>}

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
              <button key={k} onClick={() => setRed(k)} style={{
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

      {posts.length > 0 && <TablaVideos posts={posts} isMobile={isMobile} mostrarRed={ambas && vista === 'total'} key={vista} />}
    </div>
  )
}
