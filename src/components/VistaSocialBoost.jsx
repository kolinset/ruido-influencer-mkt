import { useState, useEffect, useCallback } from 'react'
import sql from '../lib/db'

// Vista de solo lectura de Social Boost para el portal del cliente.

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const firstOfMonth = s => s.slice(0, 7) + '-01'
function mondayOf(s) { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d) }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d) }
function tituloSemana(inicio) { const d = parseYmd(inicio); return `${MESES[d.getMonth()]} · Semana ${Math.ceil(d.getDate() / 7)}` }
function rangoSemana(inicio) {
  const a = parseYmd(inicio), b = parseYmd(addDays(inicio, 6))
  return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3).toLowerCase()}`
}
const MAX_MES = 120
const primerNombre = n => (n || '').split(' ')[0]
const COLORES = ['#E8313A', '#3B5BDB', '#1D9E75', '#BA7517', '#7C3AED', '#0369A1', '#C2185B']

export default function VistaSocialBoost({ isMobile }) {
  const [inicio, setInicio] = useState(mondayOf(ymd(new Date())))
  const [slots, setSlots] = useState([])
  const [kpi, setKpi] = useState({ mes: 0, semana: 0 })
  const [reparto, setReparto] = useState([])
  const [loading, setLoading] = useState(true)
  const [abierta, setAbierta] = useState(null)   // canción abierta (slot)
  const [videos, setVideos] = useState([])

  const mes = firstOfMonth(inicio)
  const esActual = inicio === mondayOf(ymd(new Date()))

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const sem = (await sql`SELECT id FROM sb_semanas WHERE inicio = ${inicio}`)[0]
      if (sem) {
        setSlots(await sql`
          SELECT ss.slot, c.id AS cancion_id, c.cancion, c.artista, c.tokchart_url, c.solicitante,
            (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id AND v.semana_id = ss.semana_id)::int AS vids_sem,
            (SELECT count(*) FROM sb_videos v WHERE v.cancion_id = c.id)::int AS vids_mes
          FROM sb_semana_slots ss JOIN sb_canciones c ON c.id = ss.cancion_id
          WHERE ss.semana_id = ${sem.id} ORDER BY ss.slot`)
      } else setSlots([])
      const kMes = await sql`SELECT count(*)::int AS n FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id WHERE c.mes = ${mes}`
      const kSem = sem ? await sql`SELECT count(*)::int AS n FROM sb_videos WHERE semana_id = ${sem.id}` : [{ n: 0 }]
      setKpi({ mes: kMes[0].n, semana: kSem[0].n })
      setReparto(await sql`SELECT cu.id, cu.nombre, count(*)::int AS n
        FROM sb_videos v JOIN sb_canciones c ON c.id = v.cancion_id
        LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
        WHERE c.mes = ${mes} GROUP BY cu.id, cu.nombre ORDER BY n DESC`)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [inicio])
  useEffect(() => { cargar() }, [cargar])

  async function abrir(s) {
    setAbierta(s); setVideos([])
    try {
      setVideos(await sql`SELECT v.id, v.link_web, v.link_original, v.handle, s.inicio::text AS semana_inicio, cu.nombre AS cuenta_nombre
        FROM sb_videos v LEFT JOIN sb_semanas s ON s.id = v.semana_id
        LEFT JOIN sb_cuentas cu ON cu.id = COALESCE(v.cuenta_id, (SELECT x.id FROM sb_cuentas x WHERE x.handle <> '' AND v.handle <> '' AND lower(replace(x.handle, '@', '')) = lower(v.handle) LIMIT 1))
        WHERE v.cancion_id = ${s.cancion_id} ORDER BY v.created_at DESC, v.id`)
    } catch (e) { console.error(e) }
  }

  const card = { background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 14 }
  const btnGhost = { background: '#fff', border: '0.5px solid #D0D0CC', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: '#555', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }

  // ───── Detalle de una canción ─────
  if (abierta) {
    const links = videos.map(v => v.link_web || v.link_original).filter(Boolean)
    return (
      <div>
        <button style={{ ...btnGhost, marginBottom: 14 }} onClick={() => setAbierta(null)}>← {tituloSemana(inicio)}</button>
        <div style={{ ...card, padding: 18, marginBottom: 14, borderTop: '3px solid #E8313A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 500 }}>{abierta.cancion}</div>
              <div style={{ fontSize: 13, color: '#888' }}>{abierta.artista || '—'}{abierta.solicitante ? ` · Solicitada por ${abierta.solicitante}` : ''}</div>
            </div>
            {abierta.tokchart_url && <a href={abierta.tokchart_url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, alignSelf: 'flex-start' }}>Reporte Tokchart ↗</a>}
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 14 }}>
            <div><div style={{ fontSize: 22, fontWeight: 500 }}>{abierta.vids_sem}</div><div style={{ fontSize: 11, color: '#999' }}>esta semana</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 500 }}>{abierta.vids_mes}</div><div style={{ fontSize: 11, color: '#999' }}>en el mes</div></div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Videos</div>
          {links.length > 0 && <button style={btnGhost} onClick={() => navigator.clipboard.writeText(links.join('\n')).then(() => alert(`${links.length} links copiados`)).catch(() => prompt('Copiá:', links.join('\n')))}>Copiar todos los links</button>}
        </div>
        <div style={{ ...card, overflowX: 'auto' }}>
          {videos.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Aún no hay videos para esta canción.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
              <thead><tr style={{ background: '#F7F7F5' }}>
                {['#', 'Semana', 'Usuario', 'Video'].map(h => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: '#AAA' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {videos.map((v, i) => (
                  <tr key={v.id} style={{ borderTop: '0.5px solid #F3F3F1' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#AAA' }}>{videos.length - i}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: '#888' }}>{v.semana_inicio ? rangoSemana(v.semana_inicio) : '—'}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{v.handle ? '@' + v.handle : (v.cuenta_nombre || '—')}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>
                      {(v.link_web || v.link_original) ? <a href={v.link_web || v.link_original} target="_blank" rel="noopener noreferrer" style={{ color: '#3B5BDB', textDecoration: 'none' }}>Ver video ↗</a> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  // ───── Panel de la semana ─────
  const total = reparto.reduce((a, r) => a + r.n, 0)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 500, letterSpacing: '-.01em' }}>{tituloSemana(inicio)}</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 3 }}>{rangoSemana(inicio)}{esActual ? ' · en curso' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnGhost} onClick={() => setInicio(addDays(inicio, -7))}>←</button>
          <button style={{ ...btnGhost, fontWeight: 500 }} onClick={() => setInicio(mondayOf(ymd(new Date())))}>Esta semana</button>
          <button style={btnGhost} onClick={() => setInicio(addDays(inicio, 7))}>→</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {[[kpi.mes, `/ ${MAX_MES}`, 'videos en el mes'], [kpi.semana, '', 'videos esta semana'], [slots.length, '/ 5', 'canciones activas']].map(([n, de, l]) => (
          <div key={l} style={{ ...card, padding: '10px 16px', minWidth: isMobile ? 'calc(50% - 5px)' : 150, flex: isMobile ? 1 : 'none' }}>
            <div style={{ fontSize: 20, fontWeight: 500 }}>{n}<span style={{ fontSize: 13, color: '#999', fontWeight: 400 }}> {de}</span></div>
            <div style={{ fontSize: 11, color: '#999' }}>{l}</div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ color: '#AAA', fontSize: 13 }}>Cargando…</div> : slots.length === 0 ? (
        <div style={{ ...card, padding: 36, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Todavía no hay canciones en esta semana.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {slots.map(s => (
            <div key={s.slot} onClick={() => abrir(s)} style={{ ...card, borderTop: '3px solid #E8313A', cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 230 }}>
              <div style={{ padding: '14px 14px 8px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#E8313A', fontWeight: 600 }}>Canción {s.slot}</div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4, lineHeight: 1.25 }}>{s.cancion}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{s.artista || '—'}</div>
                {s.solicitante && <div style={{ display: 'inline-block', marginTop: 8, fontSize: 11, background: '#F1EFE8', color: '#5F5E5A', borderRadius: 6, padding: '2px 8px' }}>Pidió {primerNombre(s.solicitante)}</div>}
              </div>
              <div style={{ padding: '0 14px 4px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-.02em' }}>{s.vids_sem}</div>
                <div style={{ fontSize: 11.5, color: '#999' }}>videos esta semana</div>
              </div>
              <div style={{ padding: '0 14px 10px', fontSize: 12, color: '#888' }}>{s.vids_mes} en el mes</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px' }} onClick={e => e.stopPropagation()}>
                <button style={{ ...btnGhost, flex: 1, fontSize: 12.5 }} onClick={() => abrir(s)}>Ver videos</button>
                {s.tokchart_url && <a href={s.tokchart_url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, fontSize: 12.5 }}>Tokchart ↗</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div style={{ ...card, padding: 18, marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Videos por cuenta</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>{MESES[parseYmd(mes).getMonth()]} · {total} videos</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#F0F0EE', marginBottom: 12 }}>
            {reparto.map((r, i) => <div key={r.id || 'sin'} style={{ width: (r.n / total * 100) + '%', background: r.id ? COLORES[i % COLORES.length] : '#CFCFCB' }} />)}
          </div>
          {reparto.map((r, i) => (
            <div key={r.id || 'sin'} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13 }}>
              <div style={{ width: 9, height: 9, borderRadius: 3, background: r.id ? COLORES[i % COLORES.length] : '#CFCFCB' }} />
              <div style={{ flex: 1 }}>{r.nombre || 'Otras'}</div>
              <div><b style={{ fontWeight: 500 }}>{Math.round(r.n / total * 100)}%</b> <span style={{ color: '#999', fontSize: 12 }}>· {r.n}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
