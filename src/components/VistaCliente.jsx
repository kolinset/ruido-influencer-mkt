import { useState, useEffect } from 'react'
import { publicSql } from '../lib/db'
import Logo from './Logo'

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

function fmtNum(n) {
  n = Number(n) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
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

function ProfileLink({ username, link }) {
  if (!username) return <span style={{ color: '#CCC', fontSize: 13 }}>—</span>
  if (link) return (
    <a href={link} target="_blank" rel="noopener noreferrer"
      style={{ color: '#C4501A', fontWeight: 500, textDecoration: 'none', fontSize: 13 }}
      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
    >{username} <span style={{ fontSize: 10, opacity: 0.6 }}>↗</span></a>
  )
  return <span style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>{username}</span>
}

function ReporteBtn({ url, plataforma }) {
  const isTT = plataforma === 'TikTok'
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2, padding: '6px 12px', borderRadius: 8, minWidth: 70,
        background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)',
        color: '#fff', textDecoration: 'none', transition: 'all .15s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
    >
      <span style={{ fontSize: 14 }}>◈</span>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: '.03em' }}>
        Métricas {isTT ? 'TT' : 'IG'}
      </span>
    </a>
  )
}

function ClippingBar({ logradas, min, max }) {
  const l = Number(logradas) || 0
  const mn = Number(min) || 0
  const mx = Number(max) || 0
  if (mx === 0) return null
  const pctLogradas = Math.min(100, Math.round((l / mx) * 100))
  const pctMin = mn > 0 ? Math.min(100, Math.round((mn / mx) * 100)) : 0
  const superaMax = l >= mx
  const superaMin = l >= mn && mn > 0
  const barColor = superaMax ? '#3B5BDB' : superaMin ? '#639922' : '#AAA'
  let statusText = '', statusColor = '#AAA', statusBg = '#F0F0EE'
  if (superaMax) { statusText = 'Meta superada ✓'; statusColor = '#fff'; statusBg = 'rgba(59,91,219,0.25)' }
  else if (superaMin) { statusText = 'Dentro del rango ✓'; statusColor = '#fff'; statusBg = 'rgba(99,153,34,0.25)' }
  else if (l > 0) { statusText = 'En progreso'; statusColor = 'rgba(255,255,255,0.6)'; statusBg = 'rgba(255,255,255,0.1)' }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'visible', marginBottom: 8 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: pctLogradas + '%', background: barColor, borderRadius: 4, transition: 'width .4s ease' }} />
        {mn > 0 && (
          <div style={{ position: 'absolute', left: pctMin + '%', top: -3, width: 2, height: 14, background: 'rgba(255,255,255,0.5)', borderRadius: 1, transform: 'translateX(-1px)' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {statusText && <span style={{ fontSize: 11, background: statusBg, color: statusColor, padding: '2px 9px', borderRadius: 20 }}>{statusText}</span>}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>{pctLogradas}% de {fmtNum(mx)}</span>
      </div>
    </div>
  )
}

function SpotifyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  )
}

export default function VistaCliente({ token }) {
  const [camp, setCamp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { if (token) fetchPublicCamp(token) }, [token])

  async function fetchPublicCamp(t) {
    setLoading(true)
    try {
      const campData = await publicSql('campanaPorShareToken', t)
      if (campData.length === 0) {
        const check = await publicSql('campanaShareTokenExiste', t)
        setError(check.length === 0 ? 'not_found' : 'inactive')
        setLoading(false)
        return
      }

      const campInfo = campData[0]
      const isEspecial = campInfo.tipo === 'Nano Blast' || campInfo.tipo === 'Clipping'
      const isPlaylisting = campInfo.tipo === 'Playlisting'

      if (isPlaylisting) {
        const playlists = await publicSql('playlistsDeCampana', campInfo.id)
        setCamp({
          nombre: campInfo.camp_nombre,
          cliente: campInfo.cliente,
          plataforma: campInfo.plataforma || 'Spotify',
          reporte_url_tt: '', reporte_url_ig: '',
          tipo: 'Playlisting',
          artista: campInfo.artista || '',
          cancion: campInfo.cancion || '',
          solicitado_por: campInfo.solicitado_por || '',
          budget_total: campInfo.budget_total || 0,
          es_legacy: campInfo.es_legacy || false,
          moneda: campInfo.moneda || 'CLP',
          playlists,
          influencers: [],
        })
        setLoading(false)
        return
      }

      if (isEspecial) {
        setCamp({
          nombre: campInfo.camp_nombre,
          cliente: campInfo.cliente,
          plataforma: campInfo.plataforma || 'Ambas',
          reporte_url_tt: campInfo.reporte_url_tt || '',
          reporte_url_ig: campInfo.reporte_url_ig || '',
          tipo: campInfo.tipo,
          contenidos_count: campInfo.contenidos_count || 0,
          views_logradas: campInfo.views_logradas || 0,
          views_min: campInfo.views_min || 0,
          views_max: campInfo.views_max || 0,
          artista: campInfo.artista || '',
          cancion: campInfo.cancion || '',
          solicitado_por: campInfo.solicitado_por || '',
          budget_total: campInfo.budget_total || 0,
          es_legacy: campInfo.es_legacy || false,
          moneda: campInfo.moneda || 'CLP',
          influencers: [],
        })
        setLoading(false)
        return
      }

      // Estándar — cargar influencers
      const rows = await publicSql('influencersPorShareToken', t)
      // Si la campaña todavía no tiene influencers, los datos generales salen de campInfo
      const info = rows[0] || campInfo
      setCamp({
        nombre: info.camp_nombre,
        cliente: info.cliente,
        plataforma: info.plataforma || 'Ambas',
        reporte_url_tt: info.reporte_url_tt || '',
        reporte_url_ig: info.reporte_url_ig || '',
        tipo: info.tipo || 'Influencer MKT',
        contenidos_count: info.contenidos_count || 0,
        views_logradas: info.views_logradas || 0,
        artista: info.artista || '',
        cancion: info.cancion || '',
        solicitado_por: info.solicitado_por || '',
        budget_total: info.budget_total || 0,
        es_legacy: info.es_legacy || false,
        moneda: info.moneda || 'CLP',
        influencers: rows.sort((a, b) => {
          if (info.plataforma === 'Instagram') {
            return Number(b.ig_seguidores) - Number(a.ig_seguidores)
          }
          return Number(b.tt_seguidores) - Number(a.tt_seguidores)
        }),
      })
    } catch (e) { console.error(e); setError('error') }
    setLoading(false)
  }

  if (loading) return (
    <div className="glass-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: '#AAA' }}>Cargando propuesta...</div>
    </div>
  )

  if (error) return (
    <div className="glass-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#AAA' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#555', marginBottom: 6 }}>
          {error === 'not_found' ? 'Propuesta no encontrada' : error === 'inactive' ? 'Este link ha sido desactivado' : 'Error al cargar'}
        </div>
        <div style={{ fontSize: 13 }}>
          {error === 'not_found' ? 'Verifica el link con tu agencia.' : 'Contacta a tu agencia para obtener un link actualizado.'}
        </div>
      </div>
    </div>
  )

  const plat = camp.plataforma || 'Ambas'
  const showIG = plat === 'Ambas' || plat === 'Instagram'
  const showTT = plat === 'Ambas' || plat === 'TikTok'
  const showBoth = plat === 'Ambas'
  const isNanoBlast = camp.tipo === 'Nano Blast'
  const isClipping = camp.tipo === 'Clipping'
  const isPlaylisting = camp.tipo === 'Playlisting'
  const isEspecial = isNanoBlast || isClipping || isPlaylisting

  const hasReporteTT = showTT && camp.reporte_url_tt
  const hasReporteIG = showIG && camp.reporte_url_ig
  const hasAnyReporte = hasReporteTT || hasReporteIG

  const totalIG = camp.influencers.reduce((s, i) => s + Number(i.ig_seguidores), 0)
  const totalTT = camp.influencers.reduce((s, i) => s + Number(i.tt_seguidores), 0)
  const totalSeg = (showIG ? totalIG : 0) + (showTT ? totalTT : 0)
  const hasVideoTT = showTT && camp.influencers.some(i => i.video_link_tt)
  const hasVideoIG = showIG && camp.influencers.some(i => i.video_link_ig)
  const hasBoostcode = camp.influencers.some(i => i.boostcode && i.boostcode.trim() !== '')

  const thStyle = {
    padding: '11px 16px', textAlign: 'left', fontSize: 10.5,
    fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: '#AAA',
  }

  return (
    <div className="glass-app" style={{ minHeight: '100vh', paddingBottom: 8 }}>

      {/* Header */}
      <div className="portal-hero" style={{ margin: '16px 24px 0', padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Logo height={18} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '.05em' }}>— Influencer MKT</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22, fontWeight: 500, color: '#fff' }}>{camp.nombre}</h1>
              {isEspecial && (
                <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                  {camp.tipo}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {camp.cliente}
              {camp.artista && <span> · {camp.artista}{camp.cancion ? ` — "${camp.cancion}"` : ''}</span>}
              {!isPlaylisting && plat !== 'Ambas' && <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.1)', padding: '1px 8px', borderRadius: 20, fontSize: 11 }}>{plat}</span>}
            </p>
            {camp.solicitado_por && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                Solicitado por: <span style={{ color: 'rgba(255,255,255,0.65)' }}>{camp.solicitado_por}</span>
              </p>
            )}
            {!camp.es_legacy && Number(camp.budget_total) > 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
                Budget: <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>${Number(camp.budget_total).toLocaleString('es-CL')} {camp.moneda || 'CLP'}</span>
              </p>
            )}
          </div>
          {hasAnyReporte && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {hasReporteTT && <ReporteBtn url={camp.reporte_url_tt} plataforma="TikTok" />}
              {hasReporteIG && <ReporteBtn url={camp.reporte_url_ig} plataforma="Instagram" />}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {isPlaylisting && (
            <div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Playlists</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: '#fff' }}>{camp.playlists?.length || 0}</div>
            </div>
          )}
          {isNanoBlast && (
            <div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Contenidos publicados</div>
              <div style={{ fontSize: 26, fontWeight: 500, color: '#fff' }}>{fmtNum(camp.contenidos_count)}</div>
            </div>
          )}
          {isClipping && (
            <>
              <div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Videos publicados</div>
                <div style={{ fontSize: 26, fontWeight: 500, color: '#fff' }}>{fmtNum(camp.contenidos_count)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Views logradas</div>
                    <div style={{ fontSize: 26, fontWeight: 500, color: '#fff' }}>{fmtNum(camp.views_logradas)}</div>
                  </div>
                  {camp.views_min > 0 && camp.views_max > 0 && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', paddingBottom: 4 }}>
                      meta {fmtNum(camp.views_min)} — {fmtNum(camp.views_max)}
                    </div>
                  )}
                </div>
                {camp.views_max > 0 && (
                  <ClippingBar logradas={camp.views_logradas} min={camp.views_min} max={camp.views_max} />
                )}
              </div>
            </>
          )}
          {!isEspecial && (
            <>
              <div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Influencers</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>{camp.influencers.length}</div>
              </div>
              {showIG && <div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Instagram</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>{fmtSeg(totalIG)}</div>
              </div>}
              {showTT && <div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>TikTok</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>{fmtSeg(totalTT)}</div>
              </div>}
              {showBoth && <div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Alcance total</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: '#fff' }}>{fmtSeg(totalSeg)}</div>
              </div>}
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '28px 40px' }}>

        {/* Vista Playlisting */}
        {isPlaylisting && (
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
            {(!camp.playlists || camp.playlists.length === 0) ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
                Las playlists estarán disponibles próximamente.
              </div>
            ) : (
              camp.playlists.map((pl, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                  borderBottom: i < camp.playlists.length - 1 ? '0.5px solid #F0F0EE' : 'none',
                }}>
                  {/* Ícono Spotify */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1DB954', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                    <SpotifyIcon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{pl.nombre}</div>
                    <div style={{ fontSize: 11.5, color: '#AAA' }}>Spotify Playlist</div>
                  </div>
                  <a href={pl.link} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      background: '#1DB954', color: '#fff',
                      textDecoration: 'none', fontSize: 13, fontWeight: 500,
                      flexShrink: 0, transition: 'background .15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#17a349'}
                    onMouseLeave={e => e.currentTarget.style.background = '#1DB954'}
                  >
                    <SpotifyIcon /> Abrir ↗
                  </a>
                </div>
              ))
            )}
          </div>
        )}

        {/* Vista Nano Blast / Clipping */}
        {(isNanoBlast || isClipping) && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: 13 }}>
            {hasAnyReporte
              ? 'Usa los botones de métricas en el header para ver el reporte completo de esta campaña.'
              : 'El reporte de métricas estará disponible próximamente.'}
          </div>
        )}

        {/* Vista Estándar — tabla influencers */}
        {!isEspecial && (
          <div style={{ background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                    <th style={{ ...thStyle, minWidth: 180 }}>Influencer</th>
                    {showIG && <th style={{ ...thStyle, minWidth: 150 }}>Instagram</th>}
                    {showTT && <th style={{ ...thStyle, minWidth: 150 }}>TikTok</th>}
                    <th style={{ ...thStyle, minWidth: 150 }}>Categorías</th>
                    {hasVideoIG && <th style={{ ...thStyle, minWidth: 80 }}>Post IG</th>}
                    {hasVideoTT && <th style={{ ...thStyle, minWidth: 80 }}>Video TT</th>}
                    {hasBoostcode && <th style={{ ...thStyle, minWidth: 110 }}>Boostcode</th>}
                  </tr>
                </thead>
                <tbody>
                  {camp.influencers.map((inf, i) => {
                    const tipos = inf.tipos_contenido || []
                    const igSize = getSize(inf.ig_seguidores)
                    const ttSize = getSize(inf.tt_seguidores)
                    return (
                      <tr key={i} style={{ borderBottom: i < camp.influencers.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>
                        <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar nombre={inf.nombre} index={i} />
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{inf.nombre}</span>
                          </div>
                        </td>
                        {showIG && (
                          <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
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
                          <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
                            <ProfileLink username={inf.tt_usuario} link={inf.tt_link} />
                            {inf.tt_seguidores > 0 && (
                              <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>
                                {fmtSeg(inf.tt_seguidores)}
                                <span style={{ marginLeft: 4, fontSize: 10, background: '#F1EFE8', color: '#5F5E5A', padding: '0 5px', borderRadius: 10 }}>{ttSize}</span>
                              </div>
                            )}
                          </td>
                        )}
                        <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {tipos.map(t => {
                              const c = TIPO_COLORS[t] || TIPO_COLORS['Otros']
                              return <span key={t} style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 20, fontSize: 11 }}>{t}</span>
                            })}
                            {tipos.length === 0 && <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                          </div>
                        </td>
                        {hasVideoIG && (
                          <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
                            {inf.video_link_ig
                              ? <a href={inf.video_link_ig} target="_blank" rel="noopener noreferrer"
                                  style={{ color: '#C2185B', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}
                                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                                >Ver ↗</a>
                              : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                          </td>
                        )}
                        {hasVideoTT && (
                          <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
                            {inf.video_link_tt
                              ? <a href={inf.video_link_tt} target="_blank" rel="noopener noreferrer"
                                  style={{ color: '#1A1A1A', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}
                                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                                >Ver ↗</a>
                              : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                          </td>
                        )}
                        {hasBoostcode && (
                          <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
                            {inf.boostcode && inf.boostcode.trim()
                              ? <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, background: '#F7F7F5', border: '0.5px solid #E5E5E2', padding: '3px 10px', borderRadius: 6, color: '#1A1A1A', letterSpacing: '.05em' }}>{inf.boostcode}</span>
                              : <span style={{ color: '#CCC', fontSize: 12 }}>—</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '14px 16px', background: '#F7F7F5', borderTop: '0.5px solid #E5E5E2', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>Total influencers</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{camp.influencers.length}</div>
              </div>
              {showIG && <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>Instagram</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtSeg(totalIG)}</div>
              </div>}
              {showTT && <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>TikTok</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtSeg(totalTT)}</div>
              </div>}
              {showBoth && <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>Alcance total</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtSeg(totalSeg)}</div>
              </div>}
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: '#CCC' }}>
          Propuesta generada por <Logo height={10} dark style={{ opacity: 0.4 }} />
        </div>
      </div>
    </div>
  )
}
