import { useState, useEffect } from 'react'

// Mapea sobrenombres/variantes al nombre completo de cada solicitante,
// así el filtro los agrupa aunque estén cargados distinto en cada campaña.
const SOLICITANTES_ALIAS = [
  { canonical: 'Valeria Moraga', aliases: ['valeria moraga', 'vale moraga', 'valeria', 'vale'] },
  { canonical: 'Gabriela Albarracín', aliases: ['gabriela albarracin', 'gaby albarracin', 'gabriela', 'gaby'] },
  { canonical: 'Dominique De Solminihac', aliases: ['dominique de solminihac', 'domi de solminihac', 'dominique', 'domi'] },
  { canonical: 'Juan Pablo Jiménez', aliases: ['juan pablo jimenez', 'jp jimenez', 'juan pablo', 'jp'] },
]

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeSolicitante(raw) {
  if (!raw || !raw.trim()) return null
  const clean = stripAccents(raw.trim().toLowerCase())
  const found = SOLICITANTES_ALIAS.find(p => p.aliases.some(a => stripAccents(a) === clean))
  return found ? found.canonical : raw.trim()
}
import sql from '../lib/db'
import VistaSocialBoost from './VistaSocialBoost'

const ESTADO_CAMP_COLORS = {
  Activa:    { bg: '#EAF3DE', color: '#27500A' },
  Pausada:   { bg: '#FAEEDA', color: '#633806' },
  Cerrada:   { bg: '#E6F1FB', color: '#0C447C' },
  Cancelada: { bg: '#FCEBEB', color: '#791F1F' },
}

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
  { label: 'Nano',  min: 0,       max: 10000 },
  { label: 'Micro', min: 10000,   max: 150000 },
  { label: 'Mid',   min: 150000,  max: 750000 },
  { label: 'Macro', min: 750000,  max: 4000000 },
  { label: 'Mega',  min: 4000000, max: Infinity },
]

function getSize(n) {
  n = Number(n)
  return SIZE_RANGES.find(r => n >= r.min && n < r.max)?.label || 'Nano'
}

const AV_COLORS = [
  { bg: '#FDDADA', color: '#C0392B' },
  { bg: '#E6EEFF', color: '#3B5BDB' },
  { bg: '#E1F5EE', color: '#1D9E75' },
  { bg: '#F3E8FF', color: '#7C3AED' },
  { bg: '#FFF3CD', color: '#BA7517' },
  { bg: '#FDE8F0', color: '#C2185B' },
  { bg: '#D4F4FF', color: '#0369A1' },
  { bg: '#E8F5E9', color: '#2E7D32' },
]

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function fmtNum(n) {
  n = Number(n) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 720 : false)
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
    }}>{nombre?.[0]?.toUpperCase()}</div>
  )
}

function ProfileLink({ username, link }) {
  if (!username) return <span style={{ color: '#CCC', fontSize: 13 }}>—</span>
  if (link) return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      style={{ color: '#E8313A', fontWeight: 500, textDecoration: 'none', fontSize: 13 }}
    >{username} <span style={{ fontSize: 10, opacity: 0.6 }}>↗</span></a>
  )
  return <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>{username}</span>
}

function ReporteBtn({ url, plataforma, isMobile }) {
  const isTT = plataforma === 'TikTok'
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, padding: isMobile ? '8px 12px' : '6px 12px', borderRadius: 8,
        minWidth: isMobile ? 64 : 70, minHeight: isMobile ? 44 : 'auto',
        background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
        color: '#fff', textDecoration: 'none', transition: 'all .15s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
    >
      <span style={{ fontSize: 14 }}>◈</span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: '.03em' }}>
        Métricas {isTT ? 'TT' : 'IG'}
      </span>
    </a>
  )
}

function SpotifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )
}

function ClippingBar({ logradas, min, max, dark = false }) {
  const l = Number(logradas) || 0
  const mn = Number(min) || 0
  const mx = Number(max) || 0
  if (mx === 0) return null
  const pctLogradas = Math.min(100, Math.round((l / mx) * 100))
  const pctMin = mn > 0 ? Math.min(100, Math.round((mn / mx) * 100)) : 0
  const superaMax = l >= mx
  const superaMin = l >= mn && mn > 0
  const barColor = superaMax ? '#3B5BDB' : superaMin ? '#639922' : '#AAA'

  let statusText = '', statusColor = '', statusBg = ''
  if (dark) {
    if (superaMax) { statusText = 'Meta superada ✓'; statusColor = '#fff'; statusBg = 'rgba(59,91,219,0.25)' }
    else if (superaMin) { statusText = 'Dentro del rango ✓'; statusColor = '#fff'; statusBg = 'rgba(99,153,34,0.25)' }
    else if (l > 0) { statusText = 'En progreso'; statusColor = 'rgba(255,255,255,0.6)'; statusBg = 'rgba(255,255,255,0.1)' }
  } else {
    if (superaMax) { statusText = 'Meta superada ✓'; statusColor = '#0C447C'; statusBg = '#E6F1FB' }
    else if (superaMin) { statusText = 'Dentro del rango ✓'; statusColor = '#27500A'; statusBg = '#EAF3DE' }
    else if (l > 0) { statusText = 'En progreso'; statusColor = '#633806'; statusBg = '#FAEEDA' }
  }

  const trackBg = dark ? 'rgba(255,255,255,0.15)' : '#E5E5E2'
  const markerBg = dark ? 'rgba(255,255,255,0.5)' : '#888'

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', height: 7, background: trackBg, borderRadius: 4, overflow: 'visible', marginBottom: 7 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: pctLogradas + '%', background: barColor, borderRadius: 4, transition: 'width .4s ease' }} />
        {mn > 0 && (
          <div style={{ position: 'absolute', left: pctMin + '%', top: -3, width: 2, height: 13, background: markerBg, borderRadius: 1, transform: 'translateX(-1px)' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {statusText
          ? <span style={{ fontSize: 11, background: statusBg, color: statusColor, padding: '2px 8px', borderRadius: 20 }}>{statusText}</span>
          : <span />
        }
        <span style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,0.4)' : '#AAA' }}>{pctLogradas}% de {fmtNum(mx)}</span>
      </div>
    </div>
  )
}

export default function VistaClienteDashboard({ token }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCamp, setSelectedCamp] = useState(null)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('')
  const [filterAnio, setFilterAnio] = useState('')
  const [filterSolicitante, setFilterSolicitante] = useState('')
  const [sortOrder, setSortOrder] = useState('reciente')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [tab, setTab] = useState('campanas')

  useEffect(() => { if (token) fetchData(token) }, [token])

  async function fetchData(t) {
    setLoading(true)
    try {
      const tokenData = await sql`
        SELECT ct.*, c.nombre AS client_nombre, c.color, c.slug, c.social_boost_activo
        FROM client_tokens ct
        JOIN clients c ON c.id = ct.client_id
        WHERE ct.token = ${t} AND ct.activo = true
        LIMIT 1
      `
      if (tokenData.length === 0) {
        const check = await sql`SELECT id FROM client_tokens WHERE token = ${t}`
        setError(check.length === 0 ? 'not_found' : 'inactive')
        setLoading(false)
        return
      }

      const clientInfo = tokenData[0]
      const camps = await sql`
        SELECT
          c.id, c.nombre, c.artista, c.cancion, c.estado,
          c.fecha_inicio, c.fecha_termino, c.plataforma,
          c.reporte_url_tt, c.reporte_url_ig,
          c.tipo, c.contenidos_count, c.views_logradas, c.views_min, c.views_max,
          c.budget_total, c.utilizable_pct, c.solicitado_por, c.es_legacy, c.moneda,
          c.created_at,
          COUNT(DISTINCT ci.id) AS total_influencers,
          COUNT(DISTINCT CASE WHEN ci.video_link_tt != '' OR ci.video_link_ig != '' THEN ci.id END) AS videos_publicados,
          COUNT(DISTINCT cp.id) AS total_playlists
        FROM campaigns c
        LEFT JOIN campaign_influencers ci ON ci.campaign_id = c.id
        LEFT JOIN campaign_playlists cp ON cp.campaign_id = c.id
        WHERE c.client_id = ${clientInfo.client_id}
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `
      setData({ client: clientInfo, camps })
    } catch (e) { console.error(e); setError('error') }
    setLoading(false)
  }

  async function openCamp(camp) {
    const isPlaylisting = camp.tipo === 'Playlisting'
    const isEspecial = camp.tipo === 'Nano Blast' || camp.tipo === 'Clipping'

    if (isPlaylisting) {
      try {
        const playlists = await sql`
          SELECT nombre, link FROM campaign_playlists
          WHERE campaign_id = ${camp.id}
          ORDER BY created_at ASC
        `
        setSelectedCamp({ ...camp, influencers: [], playlists })
      } catch (e) { console.error(e) }
      return
    }

    if (isEspecial) {
      setSelectedCamp({ ...camp, influencers: [], playlists: [] })
      return
    }

    try {
      const rows = await sql`
        SELECT
          i.nombre, i.ig_usuario, i.ig_seguidores, i.ig_link,
          i.tt_usuario, i.tt_seguidores, i.tt_link,
          i.tipos_contenido,
          ci.video_link_tt, ci.video_link_ig, ci.boostcode
        FROM campaign_influencers ci
        JOIN influencers i ON i.id = ci.influencer_id
        WHERE ci.campaign_id = ${camp.id}
        ORDER BY
          CASE WHEN ${camp.plataforma} = 'Instagram' THEN i.ig_seguidores ELSE i.tt_seguidores END DESC
      `
      setSelectedCamp({ ...camp, influencers: rows, playlists: [] })
    } catch (e) { console.error(e) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#F7F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: '#AAA' }}>Cargando...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#F7F7F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ textAlign: 'center', color: '#AAA' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#555', marginBottom: 6 }}>
          {error === 'not_found' ? 'Portal no encontrado' : error === 'inactive' ? 'Este portal ha sido desactivado' : 'Error al cargar'}
        </div>
        <div style={{ fontSize: 13 }}>Contacta a tu agencia.</div>
      </div>
    </div>
  )

  const { client, camps } = data
  const brandColor = client.color || '#E8313A'
  const padX = isMobile ? 16 : 40

  // ─── VISTA CAMPAÑA INDIVIDUAL ───
  if (selectedCamp) {
    const plat = selectedCamp.plataforma || 'Ambas'
    const showIG = plat === 'Ambas' || plat === 'Instagram'
    const showTT = plat === 'Ambas' || plat === 'TikTok'
    const showBoth = plat === 'Ambas'
    const isNanoBlast = selectedCamp.tipo === 'Nano Blast'
    const isClipping = selectedCamp.tipo === 'Clipping'
    const isPlaylisting = selectedCamp.tipo === 'Playlisting'
    const isEspecial = isNanoBlast || isClipping || isPlaylisting

    const totalIG = (selectedCamp.influencers || []).reduce((s, i) => s + Number(i.ig_seguidores), 0)
    const totalTT = (selectedCamp.influencers || []).reduce((s, i) => s + Number(i.tt_seguidores), 0)
    const totalSeg = (showIG ? totalIG : 0) + (showTT ? totalTT : 0)
    const hasVideoTT = showTT && (selectedCamp.influencers || []).some(i => i.video_link_tt)
    const hasVideoIG = showIG && (selectedCamp.influencers || []).some(i => i.video_link_ig)
    const hasBoostcode = (selectedCamp.influencers || []).some(i => i.boostcode && i.boostcode.trim())
    const hasReporteTT = showTT && selectedCamp.reporte_url_tt
    const hasReporteIG = showIG && selectedCamp.reporte_url_ig
    const hasAnyReporte = hasReporteTT || hasReporteIG

    const thStyle = {
      padding: isMobile ? '10px 12px' : '11px 16px', textAlign: 'left', fontSize: 10.5,
      fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: '#AAA',
      whiteSpace: 'nowrap',
    }
    const tdPad = isMobile ? '11px 12px' : '13px 16px'

    return (
      <div style={{ minHeight: '100vh', background: '#F7F7F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ background: '#111', padding: isMobile ? '18px 16px' : '24px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 24, height: 24, background: brandColor, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {client.client_nombre?.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>{client.client_nombre}</span>
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginLeft: 'auto', padding: '4px 0' }}
              onClick={() => setSelectedCamp(null)}>← Volver</span>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 500, color: '#fff' }}>{selectedCamp.nombre}</h1>
              {isEspecial && (
                <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                  {selectedCamp.tipo}
                </span>
              )}
            </div>
            {selectedCamp.artista && (
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>
                {selectedCamp.artista}{selectedCamp.cancion ? ` — "${selectedCamp.cancion}"` : ''}
              </p>
            )}
            {selectedCamp.solicitado_por && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                Solicitado por: <span style={{ color: 'rgba(255,255,255,0.65)' }}>{selectedCamp.solicitado_por}</span>
              </p>
            )}
            {!selectedCamp.es_legacy && selectedCamp.budget_total > 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                Budget: <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>${Number(selectedCamp.budget_total).toLocaleString('es-CL')} {selectedCamp.moneda || 'CLP'}</span>
              </p>
            )}
          </div>

          {hasAnyReporte && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {hasReporteTT && <ReporteBtn url={selectedCamp.reporte_url_tt} plataforma="TikTok" isMobile={isMobile} />}
              {hasReporteIG && <ReporteBtn url={selectedCamp.reporte_url_ig} plataforma="Instagram" isMobile={isMobile} />}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, auto)', gap: isMobile ? 12 : 20 }}>
            {isPlaylisting && (
              <div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Playlists</div>
                <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#fff' }}>{selectedCamp.playlists?.length || 0}</div>
              </div>
            )}
            {isNanoBlast && (
              <div>
                <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Contenidos publicados</div>
                <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#fff' }}>{fmtNum(selectedCamp.contenidos_count)}</div>
              </div>
            )}
            {isClipping && (
              <>
                <div>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Videos publicados</div>
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#fff' }}>{fmtNum(selectedCamp.contenidos_count)}</div>
                </div>
                <div style={{ flex: 1, minWidth: isMobile ? '100%' : 200 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Views logradas</div>
                      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#fff' }}>{fmtNum(selectedCamp.views_logradas)}</div>
                    </div>
                    {selectedCamp.views_min > 0 && selectedCamp.views_max > 0 && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', paddingBottom: 2 }}>
                        meta {fmtNum(selectedCamp.views_min)} — {fmtNum(selectedCamp.views_max)}
                      </div>
                    )}
                  </div>
                  {selectedCamp.views_max > 0 && (
                    <ClippingBar logradas={selectedCamp.views_logradas} min={selectedCamp.views_min} max={selectedCamp.views_max} dark={true} />
                  )}
                </div>
              </>
            )}
            {!isEspecial && (
              <>
                <div>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Influencers</div>
                  <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 500, color: '#fff' }}>{selectedCamp.influencers.length}</div>
                </div>
                {showIG && <div>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Instagram</div>
                  <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 500, color: '#fff' }}>{fmtSeg(totalIG)}</div>
                </div>}
                {showTT && <div>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>TikTok</div>
                  <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 500, color: '#fff' }}>{fmtSeg(totalTT)}</div>
                </div>}
                {showBoth && <div>
                  <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Alcance total</div>
                  <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 500, color: '#fff' }}>{fmtSeg(totalSeg)}</div>
                </div>}
              </>
            )}
          </div>
        </div>

        <div style={{ padding: isMobile ? '20px 16px' : '24px 40px' }}>

          {/* Vista Playlisting */}
          {isPlaylisting && (
            <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
              {(!selectedCamp.playlists || selectedCamp.playlists.length === 0) ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
                  Las playlists estarán disponibles próximamente.
                </div>
              ) : (
                selectedCamp.playlists.map((pl, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: isMobile ? '12px 14px' : '14px 20px',
                    borderBottom: i < selectedCamp.playlists.length - 1 ? '0.5px solid #F0F0EE' : 'none',
                  }}>
                    <div style={{ width: 38, height: 38, borderRadius: 9, background: '#1DB954', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                      <SpotifyIcon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 13.5 : 14, fontWeight: 500, marginBottom: 2 }}>{pl.nombre}</div>
                      <div style={{ fontSize: 11.5, color: '#AAA' }}>Spotify Playlist</div>
                    </div>
                    <a href={pl.link} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: isMobile ? '7px 12px' : '8px 16px', borderRadius: 8,
                        background: '#1DB954', color: '#fff',
                        textDecoration: 'none', fontSize: 12.5, fontWeight: 500,
                        flexShrink: 0, minHeight: isMobile ? 36 : 'auto',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#17a349'}
                      onMouseLeave={e => e.currentTarget.style.background = '#1DB954'}
                    >
                      <SpotifyIcon /> {isMobile ? '↗' : 'Abrir ↗'}
                    </a>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Vista Nano Blast / Clipping */}
          {(isNanoBlast || isClipping) && (
            <div style={{ textAlign: 'center', padding: isMobile ? '32px 16px' : '48px 0', color: '#888', fontSize: 13 }}>
              {hasAnyReporte
                ? 'Usa los botones de métricas arriba para ver el reporte completo.'
                : 'El reporte de métricas estará disponible próximamente.'}
            </div>
          )}

          {/* Vista Estándar — tabla influencers */}
          {!isEspecial && (
            <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 560 : 'auto' }}>
                  <thead>
                    <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                      <th style={{ ...thStyle, minWidth: 150 }}>Influencer</th>
                      {showIG && <th style={{ ...thStyle, minWidth: 130 }}>Instagram</th>}
                      {showTT && <th style={{ ...thStyle, minWidth: 130 }}>TikTok</th>}
                      <th style={{ ...thStyle, minWidth: 120 }}>Categorías</th>
                      {hasVideoIG && <th style={{ ...thStyle, minWidth: 80 }}>Post IG</th>}
                      {hasVideoTT && <th style={{ ...thStyle, minWidth: 80 }}>Video TT</th>}
                      {hasBoostcode && <th style={{ ...thStyle, minWidth: 100 }}>Boostcode</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCamp.influencers.map((inf, i) => {
                      const tipos = inf.tipos_contenido || []
                      const igSize = getSize(inf.ig_seguidores)
                      const ttSize = getSize(inf.tt_seguidores)
                      return (
                        <tr key={i} style={{ borderBottom: i < selectedCamp.influencers.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>
                          <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <Avatar nombre={inf.nombre} index={i} size={isMobile ? 28 : 32} />
                              <span style={{ fontWeight: 500, fontSize: 13 }}>{inf.nombre}</span>
                            </div>
                          </td>
                          {showIG && (
                            <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                              <ProfileLink username={inf.ig_usuario} link={inf.ig_link} />
                              {inf.ig_seguidores > 0 && (
                                <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                                  {fmtSeg(inf.ig_seguidores)}
                                  <span style={{ marginLeft: 4, fontSize: 10, background: '#F1EFE8', color: '#5F5E5A', padding: '0 5px', borderRadius: 10 }}>{igSize}</span>
                                </div>
                              )}
                            </td>
                          )}
                          {showTT && (
                            <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                              <ProfileLink username={inf.tt_usuario} link={inf.tt_link} />
                              {inf.tt_seguidores > 0 && (
                                <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                                  {fmtSeg(inf.tt_seguidores)}
                                  <span style={{ marginLeft: 4, fontSize: 10, background: '#F1EFE8', color: '#5F5E5A', padding: '0 5px', borderRadius: 10 }}>{ttSize}</span>
                                </div>
                              )}
                            </td>
                          )}
                          <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {tipos.map(t => {
                                const c = TIPO_COLORS[t] || TIPO_COLORS['Otros']
                                return <span key={t} style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 20, fontSize: 11 }}>{t}</span>
                              })}
                              {tipos.length === 0 && <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                            </div>
                          </td>
                          {hasVideoIG && (
                            <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                              {inf.video_link_ig
                                ? <a href={inf.video_link_ig} target="_blank" rel="noopener noreferrer" style={{ color: '#C2185B', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>Ver ↗</a>
                                : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                            </td>
                          )}
                          {hasVideoTT && (
                            <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                              {inf.video_link_tt
                                ? <a href={inf.video_link_tt} target="_blank" rel="noopener noreferrer" style={{ color: '#1A1A1A', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>Ver ↗</a>
                                : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                            </td>
                          )}
                          {hasBoostcode && (
                            <td style={{ padding: tdPad, verticalAlign: 'middle' }}>
                              {inf.boostcode && inf.boostcode.trim()
                                ? <span style={{ fontFamily: 'monospace', fontSize: 12.5, fontWeight: 600, background: '#F7F7F5', border: '0.5px solid #E5E5E2', padding: '3px 9px', borderRadius: 6, color: '#1A1A1A' }}>{inf.boostcode}</span>
                                : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {isMobile && (
                <div style={{ padding: '6px 12px', fontSize: 10.5, color: '#BBB', textAlign: 'center', borderTop: '0.5px solid #F0F0EE' }}>
                  ← desliza para ver más →
                </div>
              )}
              <div style={{ padding: isMobile ? '12px' : '14px 16px', background: '#F7F7F5', borderTop: '0.5px solid #E5E5E2', display: 'flex', justifyContent: isMobile ? 'space-between' : 'flex-end', gap: isMobile ? 12 : 24, flexWrap: 'wrap' }}>
                <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{selectedCamp.influencers.length}</div>
                </div>
                {showIG && <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Instagram</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtSeg(totalIG)}</div>
                </div>}
                {showTT && <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                  <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>TikTok</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtSeg(totalTT)}</div>
                </div>}
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: '#CCC' }}>
            Portal generado por KOLINSET — Influencer MKT
          </div>
        </div>
      </div>
    )
  }

  // ─── VISTA LISTA DE CAMPAÑAS ───
  const totalCamps = camps.length
  const activas = camps.filter(c => c.estado === 'Activa').length
  const cerradas = camps.filter(c => c.estado === 'Cerrada').length
  const totalInfluencers = camps.reduce((s, c) => s + Number(c.total_influencers), 0)
  const totalVideos = camps.reduce((s, c) => s + Number(c.videos_publicados), 0)
  const anios = [...new Set(camps.map(c => c.created_at ? new Date(c.created_at).getFullYear() : null).filter(Boolean))].sort((a, b) => b - a)
  const solicitantes = [...new Set(camps.map(c => normalizeSolicitante(c.solicitado_por)).filter(Boolean))].sort()

  const filtered = camps
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !q || c.nombre.toLowerCase().includes(q) ||
        (c.artista || '').toLowerCase().includes(q) ||
        (c.cancion || '').toLowerCase().includes(q)
      const matchEstado = !filterEstado || c.estado === filterEstado
      const matchAnio = !filterAnio || (c.created_at && new Date(c.created_at).getFullYear() === parseInt(filterAnio))
      const matchSolicitante = !filterSolicitante || normalizeSolicitante(c.solicitado_por) === filterSolicitante
      return matchSearch && matchEstado && matchAnio && matchSolicitante
    })
    .sort((a, b) => sortOrder === 'reciente'
      ? new Date(b.created_at) - new Date(a.created_at)
      : new Date(a.created_at) - new Date(b.created_at)
    )

  const activeFiltersCount = [filterEstado, filterAnio, filterSolicitante].filter(Boolean).length
  const kpiList = [
    { label: 'Total campañas', value: totalCamps },
    { label: 'Activas', value: activas },
    { label: 'Finalizadas', value: cerradas },
    { label: 'Influencers', value: totalInfluencers },
    { label: 'Videos', value: totalVideos },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F7F7F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#111', padding: isMobile ? '20px 16px 22px' : '32px 40px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: isMobile ? 16 : 20 }}>
          <div style={{ width: isMobile ? 38 : 44, height: isMobile ? 38 : 44, borderRadius: 12, background: brandColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 14 : 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {client.client_nombre?.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2 }}>Portal de campañas</div>
            <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.client_nombre}</h1>
          </div>
        </div>
        {client.social_boost_activo && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            {[['campanas', 'Campañas'], ['socialboost', 'Social Boost']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '7px 16px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                background: tab === id ? '#fff' : 'transparent', color: tab === id ? '#111' : 'rgba(255,255,255,0.6)',
                border: '0.5px solid ' + (tab === id ? '#fff' : 'rgba(255,255,255,0.25)'),
              }}>{label}</button>
            ))}
          </div>
        )}
        {tab === 'campanas' && <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(5, auto)', gap: isMobile ? '14px 8px' : 32, width: isMobile ? '100%' : 'fit-content' }}>
          {kpiList.map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: isMobile ? 9 : 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3, lineHeight: 1.3 }}>{label}</div>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, color: '#fff' }}>{value}</div>
            </div>
          ))}
        </div>}
      </div>

      {tab === 'socialboost' && client.social_boost_activo ? (
        <div style={{ padding: isMobile ? '18px 16px' : '28px 40px' }}>
          <VistaSocialBoost isMobile={isMobile} />
          <div style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: '#CCC' }}>
            Portal generado por KOLINSET — Influencer MKT
          </div>
        </div>
      ) : (
      <div style={{ padding: isMobile ? '18px 16px' : '28px 40px' }}>
        {isMobile ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Buscar campaña, artista..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minHeight: 42, fontSize: 14 }} />
              <button onClick={() => setFiltersOpen(o => !o)}
                style={{ minHeight: 42, minWidth: 42, borderRadius: 8, border: '0.5px solid #E5E5E2', background: activeFiltersCount > 0 ? '#FCEBEB' : '#fff', color: activeFiltersCount > 0 ? '#A32D2D' : '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, position: 'relative', flexShrink: 0 }}>
                ⚙
                {activeFiltersCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#E8313A', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFiltersCount}</span>
                )}
              </button>
            </div>
            {filtersOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: 12 }}>
                <select className="input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)} style={{ minHeight: 42 }}>
                  <option value="">Todos los estados</option>
                  <option>Activa</option><option>Pausada</option><option>Cerrada</option><option>Cancelada</option>
                </select>
                {anios.length > 1 && (
                  <select className="input" value={filterAnio} onChange={e => setFilterAnio(e.target.value)} style={{ minHeight: 42 }}>
                    <option value="">Todos los años</option>
                    {anios.map(a => <option key={a}>{a}</option>)}
                  </select>
                )}
                {solicitantes.length > 1 && (
                  <select className="input" value={filterSolicitante} onChange={e => setFilterSolicitante(e.target.value)} style={{ minHeight: 42 }}>
                    <option value="">Todos los solicitantes</option>
                    {solicitantes.map(s => <option key={s}>{s}</option>)}
                  </select>
                )}
                <select className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ minHeight: 42 }}>
                  <option value="reciente">Más reciente</option>
                  <option value="antigua">Más antigua</option>
                </select>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Buscar campaña, artista..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, maxWidth: 280 }} />
            <select className="input" value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option>Activa</option><option>Pausada</option><option>Cerrada</option><option>Cancelada</option>
            </select>
            {anios.length > 1 && (
              <select className="input" value={filterAnio} onChange={e => setFilterAnio(e.target.value)}>
                <option value="">Todos los años</option>
                {anios.map(a => <option key={a}>{a}</option>)}
              </select>
            )}
            {solicitantes.length > 1 && (
              <select className="input" value={filterSolicitante} onChange={e => setFilterSolicitante(e.target.value)}>
                <option value="">Todos los solicitantes</option>
                {solicitantes.map(s => <option key={s}>{s}</option>)}
              </select>
            )}
            <select className="input" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
              <option value="reciente">Más reciente</option>
              <option value="antigua">Más antigua</option>
            </select>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Sin resultados</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(camp => {
              const ec = ESTADO_CAMP_COLORS[camp.estado] || ESTADO_CAMP_COLORS['Activa']
              const plat = camp.plataforma || 'Ambas'
              const hasTT = (plat === 'Ambas' || plat === 'TikTok') && camp.reporte_url_tt
              const hasIG = (plat === 'Ambas' || plat === 'Instagram') && camp.reporte_url_ig
              const isEspecialCamp = camp.tipo === 'Nano Blast' || camp.tipo === 'Clipping' || camp.tipo === 'Playlisting'
              const isPlaylistingCamp = camp.tipo === 'Playlisting'
              const showBudget = !camp.es_legacy && Number(camp.budget_total) > 0

              if (isMobile) {
                return (
                  <div key={camp.id} onClick={() => openCamp(camp)}
                    style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '14px 14px 12px', cursor: 'pointer', borderLeft: `3px solid ${brandColor}` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 3, lineHeight: 1.3 }}>{camp.nombre}</div>
                        <div style={{ fontSize: 11.5, color: '#AAA' }}>
                          {camp.artista ? <>{camp.artista}{camp.cancion ? ` — "${camp.cancion}"` : ''}</> : 'Sin artista asignado'}
                        </div>
                        {camp.solicitado_por && <div style={{ fontSize: 11, color: '#BBB', marginTop: 2 }}>Por: {camp.solicitado_por}</div>}
                      </div>
                      <span style={{ fontSize: 18, color: '#CCC', flexShrink: 0 }}>›</span>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                      <span style={{ background: ec.bg, color: ec.color, padding: '2px 8px', borderRadius: 20, fontSize: 10.5 }}>{camp.estado}</span>
                      {isEspecialCamp && <span style={{ fontSize: 10, background: '#1A1A1A', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>{camp.tipo}</span>}
                      {showBudget && <span style={{ fontSize: 10.5, color: '#888' }}>${Number(camp.budget_total).toLocaleString('es-CL')} {camp.moneda || 'CLP'}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {isPlaylistingCamp ? (
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtNum(camp.total_playlists)}</div>
                            <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase' }}>Playlists</div>
                          </div>
                        ) : isEspecialCamp ? (
                          <>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtNum(camp.contenidos_count)}</div>
                              <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase' }}>{camp.tipo === 'Clipping' ? 'Videos' : 'Contenidos'}</div>
                            </div>
                            {camp.tipo === 'Clipping' && <div>
                              <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtNum(camp.views_logradas)}</div>
                              <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase' }}>Views</div>
                            </div>}
                          </>
                        ) : (
                          <>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 500 }}>{camp.total_influencers}</div>
                              <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase' }}>Influs</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 500 }}>{camp.videos_publicados}</div>
                              <div style={{ fontSize: 9.5, color: '#AAA', textTransform: 'uppercase' }}>Videos</div>
                            </div>
                          </>
                        )}
                      </div>
                      {(hasTT || hasIG) && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {hasTT && <a href={camp.reporte_url_tt} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 11px', minHeight: 36, borderRadius: 8, background: '#F7F7F5', border: '0.5px solid #E5E5E2', color: '#555', textDecoration: 'none', fontSize: 10.5 }}><span style={{ fontSize: 12 }}>◈</span> TT</a>}
                          {hasIG && <a href={camp.reporte_url_ig} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 11px', minHeight: 36, borderRadius: 8, background: '#F7F7F5', border: '0.5px solid #E5E5E2', color: '#555', textDecoration: 'none', fontSize: 10.5 }}><span style={{ fontSize: 12 }}>◈</span> IG</a>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              return (
                <div key={camp.id}
                  style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, padding: '16px 20px', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 16 }}
                  onClick={() => openCamp(camp)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = brandColor; e.currentTarget.style.transform = 'translateX(2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E2'; e.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: 3, height: 40, borderRadius: 2, background: brandColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{camp.nombre}</span>
                      <span style={{ background: ec.bg, color: ec.color, padding: '1px 8px', borderRadius: 20, fontSize: 10.5 }}>{camp.estado}</span>
                      {isEspecialCamp && <span style={{ fontSize: 10, background: '#1A1A1A', color: '#fff', padding: '1px 7px', borderRadius: 20 }}>{camp.tipo}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAA', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {camp.artista && <span>{camp.artista}{camp.cancion ? ` — "${camp.cancion}"` : ''}</span>}
                      {!camp.artista && !camp.cancion && <span>Sin artista asignado</span>}
                      {camp.solicitado_por && <span>· Por: {camp.solicitado_por}</span>}
                      {showBudget && <span>· ${Number(camp.budget_total).toLocaleString('es-CL')} {camp.moneda || 'CLP'}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexShrink: 0, alignItems: 'center' }}>
                    {isPlaylistingCamp ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtNum(camp.total_playlists)}</div>
                        <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Playlists</div>
                      </div>
                    ) : isEspecialCamp ? (
                      <>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtNum(camp.contenidos_count)}</div>
                          <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>{camp.tipo === 'Clipping' ? 'Videos' : 'Contenidos'}</div>
                        </div>
                        {camp.tipo === 'Clipping' && <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtNum(camp.views_logradas)}</div>
                          <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Views</div>
                        </div>}
                      </>
                    ) : (
                      <>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 500 }}>{camp.total_influencers}</div>
                          <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Influs</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 500 }}>{camp.videos_publicados}</div>
                          <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Videos</div>
                        </div>
                      </>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#888' }}>
                        {camp.fecha_inicio ? new Date(camp.fecha_inicio).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }) : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em' }}>Inicio</div>
                    </div>
                    {(hasTT || hasIG) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {hasTT && <a href={camp.reporte_url_tt} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '5px 9px', borderRadius: 8, minWidth: 60, background: '#F7F7F5', border: '0.5px solid #E5E5E2', color: '#555', textDecoration: 'none', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#111' }} onMouseLeave={e => { e.currentTarget.style.background = '#F7F7F5'; e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#E5E5E2' }}><span style={{ fontSize: 12 }}>◈</span><span style={{ fontSize: 8, letterSpacing: '.03em' }}>Métricas TT</span></a>}
                        {hasIG && <a href={camp.reporte_url_ig} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '5px 9px', borderRadius: 8, minWidth: 60, background: '#F7F7F5', border: '0.5px solid #E5E5E2', color: '#555', textDecoration: 'none', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#111' }} onMouseLeave={e => { e.currentTarget.style.background = '#F7F7F5'; e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#E5E5E2' }}><span style={{ fontSize: 12 }}>◈</span><span style={{ fontSize: 8, letterSpacing: '.03em' }}>Métricas IG</span></a>}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 16, color: '#CCC', flexShrink: 0 }}>›</span>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 28, textAlign: 'center', fontSize: 11, color: '#CCC' }}>
          Portal generado por KOLINSET — Influencer MKT
        </div>
      </div>
      )}
    </div>
  )
}
