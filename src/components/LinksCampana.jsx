import { useState, useEffect, useCallback } from 'react'
import sql from '../lib/db'
import { convertMany, extraerLinks, isDesktopTikTok, parseTikTok } from '../lib/links'

// Lista de links de TikTok para campañas de Clipping y Nano Blast.
// Se pega la lista completa (por ejemplo, desde el Excel del proveedor) y se puede
// reemplazar entera cada vez, o sumar links a la que ya está.

const LOTE = 20 // links que se convierten por tanda (para mostrar el avance)

const esTikTok = u => { try { const h = new URL(u).hostname.toLowerCase(); return h === 'tiktok.com' || h.endsWith('.tiktok.com') } catch { return false } }

export default function LinksCampana({ camp, isReadOnly, onChanged }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [aviso, setAviso] = useState(null)
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    try {
      setLinks(await sql`SELECT id, link_original, url, handle, video_id FROM campaign_links WHERE campaign_id = ${camp.id} ORDER BY posicion, created_at`)
    } catch (e) {
      console.error(e)
      setAviso({ tipo: 'error', txt: 'No se pudo cargar la lista de links: ' + e.message })
    }
    setLoading(false)
  }, [camp.id])
  useEffect(() => { setLoading(true); cargar() }, [cargar])

  async function actualizarConteo() {
    await sql`UPDATE campaigns SET contenidos_count = (SELECT count(*) FROM campaign_links WHERE campaign_id = ${camp.id}) WHERE id = ${camp.id}`
  }

  // Convierte los links cortos y arma las filas a guardar (sin videos repetidos)
  async function prepararFilas(lista, yaGuardados = new Set()) {
    const tiktok = lista.filter(esTikTok)
    const noTikTok = lista.length - tiktok.length
    const convertidos = []
    for (let i = 0; i < tiktok.length; i += LOTE) {
      setProgreso(`Revisando links ${Math.min(i + LOTE, tiktok.length)} de ${tiktok.length}…`)
      convertidos.push(...await convertMany(tiktok.slice(i, i + LOTE), 4))
    }
    const vistos = new Set(yaGuardados)
    const filas = []
    let repetidos = 0, sinConvertir = 0
    tiktok.forEach((original, k) => {
      const r = convertidos[k]
      const url = !r.error && isDesktopTikTok(r.url) ? r.url : ''
      const { handle, video_id } = parseTikTok(url)
      if (video_id && vistos.has(video_id)) { repetidos++; return }
      if (video_id) vistos.add(video_id)
      if (!url) sinConvertir++
      filas.push({ link_original: original, url, handle, video_id })
    })
    return { filas, repetidos, sinConvertir, noTikTok }
  }

  async function guardar(modo) {
    const lista = extraerLinks(texto)
    if (!lista.length) return setAviso({ tipo: 'error', txt: 'Pegá al menos un link.' })
    if (modo === 'reemplazar' && links.length > 0 &&
      !confirm(`Se va a reemplazar la lista actual (${links.length} links) por los ${lista.length} links que pegaste. ¿Seguir?`)) return
    setBusy(true); setAviso(null)
    try {
      const yaGuardados = modo === 'agregar' ? new Set(links.map(l => l.video_id).filter(Boolean)) : new Set()
      const { filas, repetidos, sinConvertir, noTikTok } = await prepararFilas(lista, yaGuardados)
      setProgreso('Guardando…')
      const inicio = modo === 'agregar' ? links.length : 0
      const lo = filas.map(f => f.link_original)
      if (filas.length) {
        await sql`
          INSERT INTO campaign_links (campaign_id, link_original, url, handle, video_id, posicion)
          SELECT ${camp.id}, t.lo, t.u, t.h, t.v, t.p
          FROM unnest(${lo}::text[], ${filas.map(f => f.url)}::text[], ${filas.map(f => f.handle)}::text[], ${filas.map(f => f.video_id)}::text[], ${filas.map((_, k) => inicio + k)}::int[]) AS t(lo, u, h, v, p)
          ON CONFLICT (campaign_id, link_original) DO UPDATE SET url = EXCLUDED.url, handle = EXCLUDED.handle, video_id = EXCLUDED.video_id, posicion = EXCLUDED.posicion
        `
      }
      // Reemplazar: primero se guardó lo nuevo y recién ahora se quita lo que ya no está (así nunca queda vacía si algo falla)
      if (modo === 'reemplazar') {
        await sql`DELETE FROM campaign_links WHERE campaign_id = ${camp.id} AND NOT (link_original = ANY(${lo}::text[]))`
      }
      await actualizarConteo()
      const partes = [`${filas.length} link${filas.length === 1 ? '' : 's'} ${modo === 'reemplazar' ? 'en la lista' : 'agregados'}`]
      if (repetidos) partes.push(`${repetidos} repetido${repetidos === 1 ? '' : 's'} (no se duplicaron)`)
      if (sinConvertir) partes.push(`${sinConvertir} no se pudieron convertir (quedan marcados en rojo)`)
      if (noTikTok) partes.push(`${noTikTok} no eran de TikTok (se ignoraron)`)
      setAviso({ tipo: sinConvertir || noTikTok ? 'warn' : 'ok', txt: partes.join(' · ') })
      setTexto(''); setAbierto(false)
      await cargar()
      await onChanged?.()
    } catch (e) {
      console.error(e)
      setAviso({ tipo: 'error', txt: 'No se pudo guardar: ' + e.message })
      await cargar()
    }
    setProgreso(''); setBusy(false)
  }

  async function borrar(l) {
    try {
      await sql`DELETE FROM campaign_links WHERE id = ${l.id}`
      await actualizarConteo()
      await cargar(); await onChanged?.()
    } catch (e) { alert('No se pudo borrar: ' + e.message) }
  }

  async function borrarTodos() {
    if (!confirm(`¿Borrar los ${links.length} links de esta campaña?`)) return
    setBusy(true)
    try {
      await sql`DELETE FROM campaign_links WHERE campaign_id = ${camp.id}`
      await actualizarConteo()
      setAviso({ tipo: 'ok', txt: 'Se borraron todos los links.' })
      await cargar(); await onChanged?.()
    } catch (e) { alert('No se pudo borrar: ' + e.message) }
    setBusy(false)
  }

  function copiarTodos() {
    const lista = links.map(l => l.url || l.link_original)
    navigator.clipboard.writeText(lista.join('\n')).then(() => alert(`${lista.length} links copiados`)).catch(() => prompt('Copiá:', lista.join('\n')))
  }

  const avisoColor = { ok: ['#EAF3DE', '#27500A'], warn: ['#FAEEDA', '#633806'], error: ['#FCEBEB', '#A32D2D'] }
  const q = buscar.trim().toLowerCase().replace(/^@/, '')
  const visibles = q ? links.filter(l => (l.handle || '').toLowerCase().includes(q) || (l.url || l.link_original).toLowerCase().includes(q)) : links
  const sinUrl = links.filter(l => !l.url).length

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 500 }}>Links de videos</h2>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {loading ? 'Cargando…' : `${links.length} link${links.length === 1 ? '' : 's'}${sinUrl ? ` · ${sinUrl} sin convertir` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {links.length > 0 && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={copiarTodos}>Copiar todos</button>}
          {!isReadOnly && links.length > 0 && <button className="btn-ghost" style={{ fontSize: 12 }} onClick={borrarTodos} disabled={busy}>Borrar todos</button>}
          {!isReadOnly && <button className="btn-red" style={{ fontSize: 12 }} onClick={() => { setAbierto(o => !o); setAviso(null) }}>{abierto ? 'Cerrar' : '＋ Pegar links'}</button>}
        </div>
      </div>

      {abierto && !isReadOnly && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <label className="label">Pegá los links de TikTok (uno por línea, o la columna completa del Excel)</label>
          <textarea className="input" rows={7} style={{ marginTop: 6, resize: 'vertical' }} value={texto} disabled={busy}
            onChange={e => setTexto(e.target.value)} placeholder={'https://www.tiktok.com/@usuario/video/…\nhttps://vt.tiktok.com/…'} />
          <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 6 }}>
            {texto ? `${extraerLinks(texto).length} links detectados · ` : ''}Los links cortos se convierten solos y el usuario se saca del link.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-red" disabled={busy || !texto.trim()} onClick={() => guardar('reemplazar')}>
              {busy ? 'Guardando…' : 'Reemplazar lista'}
            </button>
            <button className="btn-ghost" disabled={busy || !texto.trim()} onClick={() => guardar('agregar')}>Agregar a la lista</button>
            {progreso && <span style={{ fontSize: 12, color: '#888' }}>{progreso}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: '#AAA', marginTop: 8 }}>
            "Reemplazar lista" deja solo los links que pegaste (lo que no esté se borra). "Agregar" los suma a los que ya hay.
          </div>
        </div>
      )}

      {aviso && <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 10, fontSize: 13, background: avisoColor[aviso.tipo][0], color: avisoColor[aviso.tipo][1] }}>{aviso.txt}</div>}

      {!loading && links.length > 10 && (
        <input className="input" placeholder="Buscar usuario o link…" value={buscar} onChange={e => setBuscar(e.target.value)} style={{ marginBottom: 10, maxWidth: 280 }} />
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando…</div>
        ) : links.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
            Todavía no hay links. {!isReadOnly && 'Usá "Pegar links" para cargar la lista.'}
          </div>
        ) : (
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                  <th className="th" style={{ width: 50 }}>#</th>
                  <th className="th">Usuario</th>
                  <th className="th">Video</th>
                  {!isReadOnly && <th className="th" style={{ width: 50 }}></th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map(l => (
                  <tr key={l.id} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                    <td className="td" style={{ color: '#AAA' }}>{links.indexOf(l) + 1}</td>
                    <td className="td" style={{ fontWeight: 500 }}>{l.handle ? '@' + l.handle : <span style={{ color: '#AAA', fontWeight: 400 }}>—</span>}</td>
                    <td className="td" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.url
                        ? <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: '#C4501A', textDecoration: 'none' }}>Ver video ↗</a>
                        : <a href={l.link_original} target="_blank" rel="noopener noreferrer" style={{ color: '#A32D2D', textDecoration: 'none' }} title="No se pudo convertir este link corto">Sin convertir ↗</a>}
                    </td>
                    {!isReadOnly && (
                      <td className="td"><button className="btn-icon btn-icon-danger" onClick={() => borrar(l)} title="Borrar">✕</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
