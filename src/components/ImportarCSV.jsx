import { useState, useRef } from 'react'
import sql from '../lib/db'
import Modal from './Modal'

const TIPO_COLORS = {
  Bailes:    { bg: '#EEEDFE', color: '#3C3489' },
  Reviewers: { bg: '#E6F1FB', color: '#0C447C' },
  Humor:     { bg: '#FAEEDA', color: '#633806' },
  Lifestyle: { bg: '#E1F5EE', color: '#085041' },
  'Música':  { bg: '#FAECE7', color: '#712B13' },
  Gaming:    { bg: '#FBEAF0', color: '#72243E' },
  Moda:      { bg: '#FEF0FB', color: '#6B1560' },
  Fitness:   { bg: '#E8F5E9', color: '#1B5E20' },
  Viajes:    { bg: '#E3F2FD', color: '#0D47A1' },
  Otros:     { bg: '#F1EFE8', color: '#444441' },
}

function catColor(t) {
  return TIPO_COLORS[t] || { bg: '#F1EFE8', color: '#444441' }
}

function fmtSeg(n) {
  n = Number(n)
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return n.toLocaleString('es-CL')
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = []
    let current = ''
    let inQuotes = false
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else { current += ch }
    }
    values.push(current.trim())
    const row = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })
    rows.push(row)
  }
  return rows
}

// categorias: lista de nombres válidos desde DB (puede ser vacía → acepta todo)
function mapRow(row, categorias) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k]
    }
    return ''
  }
  const ttSeg = parseInt(get('seguidores_tiktok', 'tt_seguidores', 'tiktok_followers', 'followers_tiktok')) || 0
  const igSeg = parseInt(get('seguidores_instagram', 'ig_seguidores', 'instagram_followers', 'followers_instagram')) || 0
  const ttUser = get('username_tiktok', 'tiktok_username', 'tt_usuario', 'tiktok')
  const igUser = get('username_instagram', 'instagram_username', 'ig_usuario', 'instagram')
  const nombreRaw = ttUser || igUser || ''
  const nombre = nombreRaw.replace(/^@/, '')
  const catRaw = get('categorias', 'categoria', 'categories', 'category', 'tipos_contenido')

  let tipos = []
  if (catRaw) {
    tipos = catRaw.split(',').map(c => c.trim()).filter(Boolean)
    // Si tenemos lista de categorías de la DB, hacer match case-insensitive
    // Si no hay match exacto, buscar case-insensitive; si tampoco, usar el valor tal cual
    if (categorias.length > 0) {
      tipos = tipos.map(t => {
        const match = categorias.find(c => c.toLowerCase() === t.toLowerCase())
        return match || t  // si no coincide, se guarda tal cual (no forzamos 'Otros')
      })
    }
    // Deduplicar
    tipos = tipos.filter((v, i, arr) => arr.indexOf(v) === i)
  }
  if (tipos.length === 0) tipos = ['Otros']

  return {
    nombre: nombre || 'Sin nombre',
    tt_usuario: ttUser,
    tt_seguidores: ttSeg,
    tt_link: get('link_tiktok', 'tiktok_link', 'tt_link', 'url_tiktok'),
    ig_usuario: igUser,
    ig_seguidores: igSeg,
    ig_link: get('link_instagram', 'instagram_link', 'ig_link', 'url_instagram'),
    tipos_contenido: tipos,
    estado: 'Activo',
  }
}

function isDuplicateError(msg) {
  if (!msg) return false
  const m = msg.toLowerCase()
  return m.includes('unique') || m.includes('duplicate') || m.includes('already exists') || m.includes('violates')
}

export default function ImportarCSV({ onDone }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('upload')
  const [preview, setPreview] = useState([])
  const [errors, setErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [imported, setImported] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [skippedNames, setSkippedNames] = useState([])
  const [categorias, setCategorias] = useState([])
  const fileRef = useRef()

  async function handleOpen() {
    setStep('upload')
    setPreview([])
    setErrors([])
    setProgress(0)
    setImported(0)
    setSkipped(0)
    setSkippedNames([])
    setOpen(true)
    // Cargar categorías desde la DB al abrir
    try {
      const data = await sql`SELECT nombre FROM categorias_influencer WHERE activo = true ORDER BY nombre ASC`
      setCategorias(data.map(c => c.nombre))
    } catch (e) {
      console.error(e)
      setCategorias([]) // si falla, acepta todo
    }
  }

  function handleClose() {
    setOpen(false)
    setStep('upload')
    setPreview([])
    setErrors([])
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setErrors(['No se encontraron filas válidas en el CSV.'])
        return
      }
      const mapped = rows.map(r => mapRow(r, categorias))
      const errs = []
      mapped.forEach((r, i) => {
        if (!r.tt_usuario && !r.ig_usuario) {
          errs.push(`Fila ${i + 2}: sin usuario de TikTok ni Instagram`)
        }
      })
      setErrors(errs)
      setPreview(mapped)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    setImporting(true)
    setStep('importing')
    let count = 0
    let skip = 0
    const skippedList = []

    for (const inf of preview) {
      try {
        await sql`
          INSERT INTO influencers (
            nombre, tt_usuario, tt_seguidores, tt_link,
            ig_usuario, ig_seguidores, ig_link,
            tipos_contenido, estado
          ) VALUES (
            ${inf.nombre}, ${inf.tt_usuario}, ${inf.tt_seguidores}, ${inf.tt_link},
            ${inf.ig_usuario}, ${inf.ig_seguidores}, ${inf.ig_link},
            ${inf.tipos_contenido}, ${inf.estado}
          )
        `
        count++
      } catch (e) {
        if (isDuplicateError(e.message)) {
          skip++
          skippedList.push(inf.nombre || inf.tt_usuario || inf.ig_usuario)
        } else {
          console.error('Error importando:', inf.nombre, e)
        }
      }
      const total = count + skip
      setProgress(Math.round((total / preview.length) * 100))
      setImported(count)
      setSkipped(skip)
    }

    setSkippedNames(skippedList)
    setStep('done')
    setImporting(false)
    onDone?.()
  }

  return (
    <>
      <button className="btn-ghost" onClick={handleOpen}>↑ Importar CSV</button>

      <Modal open={open} onClose={handleClose} title="Importar influencers desde CSV">

        {/* UPLOAD */}
        {step === 'upload' && (
          <div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
              El CSV debe tener columnas para TikTok y/o Instagram. La columna de categorías acepta múltiples valores separados por coma.
            </p>
            <p style={{ fontSize: 12, color: '#AAA', marginBottom: 8 }}>
              Categorías múltiples: <code style={{ background: '#F0F0EE', padding: '1px 5px', borderRadius: 4 }}>"Música,Lifestyle"</code>
            </p>
            {categorias.length > 0 && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: '#AAA', marginBottom: 5 }}>Categorías disponibles en la plataforma:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {categorias.map(c => {
                    const col = catColor(c)
                    return <span key={c} style={{ background: col.bg, color: col.color, padding: '1px 8px', borderRadius: 20, fontSize: 11 }}>{c}</span>
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#AAA', marginTop: 5 }}>Las categorías del CSV que no coincidan se guardarán tal cual.</div>
              </div>
            )}
            <p style={{ fontSize: 12, color: '#888', marginBottom: 16, background: '#F7F7F5', padding: '8px 12px', borderRadius: 8 }}>
              ℹ Los influencers que ya existan en el roster (mismo usuario TikTok o Instagram) se saltarán automáticamente.
            </p>
            <div
              style={{ border: '1.5px dashed #D0D0CC', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#FAFAF8', transition: 'all .15s' }}
              onClick={() => fileRef.current?.click()}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#C4501A'; e.currentTarget.style.background = '#FBEFE3' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#D0D0CC'; e.currentTarget.style.background = '#FAFAF8' }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#555', marginBottom: 4 }}>Click para elegir archivo</div>
              <div style={{ fontSize: 12, color: '#AAA' }}>Solo archivos .csv</div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {errors.length > 0 && (
              <div style={{ marginTop: 12, background: '#FCEBEB', border: '0.5px solid #F7C1C1', borderRadius: 8, padding: '10px 12px' }}>
                {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#791F1F' }}>{e}</div>)}
              </div>
            )}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid #F0F0EE' }}>
              <div style={{ fontSize: 11, color: '#AAA', marginBottom: 6 }}>¿No tienes el CSV listo? Descarga la plantilla:</div>
              <button className="btn-ghost" style={{ fontSize: 12 }}
                onClick={() => {
                  const cats = categorias.length > 0 ? `"${categorias.slice(0, 2).join(',')}"` : '"Música,Lifestyle"'
                  const content = `username_tiktok,link_tiktok,seguidores_tiktok,username_instagram,link_instagram,seguidores_instagram,categorias\n@ejemplo,https://tiktok.com/@ejemplo,50000,@ejemplo_ig,https://instagram.com/ejemplo,30000,${cats}`
                  const blob = new Blob([content], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = 'plantilla_influencers.csv'; a.click()
                  URL.revokeObjectURL(url)
                }}>
                ↓ Descargar plantilla CSV
              </button>
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {step === 'preview' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: '#555' }}>
                <strong>{preview.length}</strong> influencers listos para importar
                {errors.length > 0 && <span style={{ color: '#A32D2D', marginLeft: 8 }}>· {errors.length} advertencias</span>}
              </div>
              <button className="btn-ghost" style={{ fontSize: 12 }}
                onClick={() => { setStep('upload'); fileRef.current.value = '' }}>
                Cambiar archivo
              </button>
            </div>

            {errors.length > 0 && (
              <div style={{ marginBottom: 12, background: '#FAEEDA', border: '0.5px solid #F0D4A0', borderRadius: 8, padding: '10px 12px' }}>
                {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#633806' }}>⚠ {e}</div>)}
              </div>
            )}

            <div style={{ marginBottom: 12, background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#888' }}>
              ℹ Los que ya existan en el roster se saltarán automáticamente sin generar error.
            </div>

            <div style={{ border: '0.5px solid #E5E5E2', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>Nombre</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>TikTok</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>Instagram</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em' }}>Categorías</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((inf, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid #F0F0EE' }}>
                      <td style={{ padding: '9px 12px', fontSize: 13, fontWeight: 500 }}>{inf.nombre}</td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#555' }}>
                        {inf.tt_usuario && <div>{inf.tt_usuario}</div>}
                        {inf.tt_seguidores > 0 && <div style={{ fontSize: 11, color: '#AAA' }}>{fmtSeg(inf.tt_seguidores)}</div>}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#555' }}>
                        {inf.ig_usuario && <div>{inf.ig_usuario}</div>}
                        {inf.ig_seguidores > 0 && <div style={{ fontSize: 11, color: '#AAA' }}>{fmtSeg(inf.ig_seguidores)}</div>}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {inf.tipos_contenido.map(t => {
                            const c = catColor(t)
                            return <span key={t} style={{ background: c.bg, color: c.color, padding: '1px 7px', borderRadius: 20, fontSize: 10.5 }}>{t}</span>
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={handleClose}>Cancelar</button>
              <button className="btn-red" onClick={handleImport}>
                Importar {preview.length} influencers
              </button>
            </div>
          </div>
        )}

        {/* IMPORTING */}
        {step === 'importing' && (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
              Importando... {imported + skipped} de {preview.length}
            </div>
            <div style={{ height: 6, background: '#F0F0EE', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: progress + '%', background: '#C4501A', borderRadius: 3, transition: 'width .2s' }} />
            </div>
            <div style={{ fontSize: 12, color: '#AAA' }}>{progress}%</div>
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Importación completada</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, background: '#EAF3DE', border: '0.5px solid #C5E0A0', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 500, color: '#27500A' }}>{imported}</div>
                <div style={{ fontSize: 12, color: '#3B6D11', marginTop: 3 }}>importados</div>
              </div>
              {skipped > 0 && (
                <div style={{ flex: 1, background: '#FAEEDA', border: '0.5px solid #F0D4A0', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 500, color: '#633806' }}>{skipped}</div>
                  <div style={{ fontSize: 12, color: '#854F0B', marginTop: 3 }}>ya existían</div>
                </div>
              )}
            </div>
            {skippedNames.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Saltados por duplicado:</div>
                <div style={{ background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 8, padding: '8px 12px', maxHeight: 120, overflowY: 'auto' }}>
                  {skippedNames.map((name, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#888', padding: '2px 0', borderBottom: i < skippedNames.length - 1 ? '0.5px solid #F0F0EE' : 'none' }}>{name}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn-red" onClick={handleClose}>Listo</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
