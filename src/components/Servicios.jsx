import { useState, useEffect } from 'react'
import sql from '../lib/db'
import Modal from './Modal'

function fmtPct(n) {
  return Number(n).toFixed(1).replace('.0', '') + '%'
}

const EMPTY_SVC = { nombre: '', descripcion: '', utilizable_pct: '100', activo: true }
const EMPTY_CAT = { nombre: '' }

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

function catColor(nombre) {
  return TIPO_COLORS[nombre] || { bg: '#F1EFE8', color: '#444441' }
}

export default function Servicios() {
  // ── Servicios ──
  const [services, setServices] = useState([])
  const [loadingSvc, setLoadingSvc] = useState(true)
  const [modalSvc, setModalSvc] = useState(false)
  const [formSvc, setFormSvc] = useState(EMPTY_SVC)
  const [editSvcId, setEditSvcId] = useState(null)
  const [savingSvc, setSavingSvc] = useState(false)
  const [errorSvc, setErrorSvc] = useState('')

  // ── Categorías ──
  const [categorias, setCategorias] = useState([])
  const [loadingCat, setLoadingCat] = useState(true)
  const [modalCat, setModalCat] = useState(false)
  const [formCat, setFormCat] = useState(EMPTY_CAT)
  const [editCatId, setEditCatId] = useState(null)
  const [savingCat, setSavingCat] = useState(false)
  const [errorCat, setErrorCat] = useState('')
  const [deleteCatModal, setDeleteCatModal] = useState(null)

  useEffect(() => {
    fetchServices()
    fetchCategorias()
  }, [])

  // ── SERVICIOS ──
  async function fetchServices() {
    setLoadingSvc(true)
    try {
      const data = await sql`
        SELECT s.*, COUNT(c.id) AS camp_count
        FROM services s
        LEFT JOIN campaigns c ON c.service_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at ASC
      `
      setServices(data)
    } catch (e) { console.error(e) }
    setLoadingSvc(false)
  }

  function openNewSvc() { setFormSvc(EMPTY_SVC); setEditSvcId(null); setErrorSvc(''); setModalSvc(true) }

  function openEditSvc(s) {
    setFormSvc({ nombre: s.nombre, descripcion: s.descripcion || '', utilizable_pct: String(s.utilizable_pct), activo: s.activo })
    setEditSvcId(s.id); setErrorSvc(''); setModalSvc(true)
  }

  async function handleSaveSvc() {
    if (!formSvc.nombre.trim()) { setErrorSvc('El nombre es obligatorio.'); return }
    const pct = parseFloat(formSvc.utilizable_pct)
    if (isNaN(pct) || pct < 0 || pct > 100) { setErrorSvc('El porcentaje debe estar entre 0 y 100.'); return }
    setSavingSvc(true); setErrorSvc('')
    try {
      if (editSvcId) {
        await sql`UPDATE services SET nombre=${formSvc.nombre.trim()}, descripcion=${formSvc.descripcion}, utilizable_pct=${pct}, activo=${formSvc.activo} WHERE id=${editSvcId}`
      } else {
        await sql`INSERT INTO services (nombre, descripcion, utilizable_pct, activo) VALUES (${formSvc.nombre.trim()}, ${formSvc.descripcion}, ${pct}, ${formSvc.activo})`
      }
      setModalSvc(false); await fetchServices()
    } catch (e) {
      if (e.message?.toLowerCase().includes('unique')) setErrorSvc('Ya existe un servicio con ese nombre.')
      else console.error(e)
    }
    setSavingSvc(false)
  }

  async function toggleActivo(s) {
    try { await sql`UPDATE services SET activo=${!s.activo} WHERE id=${s.id}`; await fetchServices() }
    catch (e) { console.error(e) }
  }

  const margenPreview = (() => {
    const pct = parseFloat(formSvc.utilizable_pct)
    if (isNaN(pct)) return '—'
    return (100 - pct).toFixed(1).replace('.0', '') + '%'
  })()

  // ── CATEGORÍAS ──
  async function fetchCategorias() {
    setLoadingCat(true)
    try {
      const data = await sql`SELECT * FROM categorias_influencer ORDER BY nombre ASC`
      setCategorias(data)
    } catch (e) { console.error(e) }
    setLoadingCat(false)
  }

  function openNewCat() { setFormCat(EMPTY_CAT); setEditCatId(null); setErrorCat(''); setModalCat(true) }

  function openEditCat(c) { setFormCat({ nombre: c.nombre }); setEditCatId(c.id); setErrorCat(''); setModalCat(true) }

  async function handleSaveCat() {
    if (!formCat.nombre.trim()) { setErrorCat('El nombre es obligatorio.'); return }
    setSavingCat(true); setErrorCat('')
    try {
      if (editCatId) {
        await sql`UPDATE categorias_influencer SET nombre=${formCat.nombre.trim()} WHERE id=${editCatId}`
      } else {
        await sql`INSERT INTO categorias_influencer (nombre) VALUES (${formCat.nombre.trim()})`
      }
      setModalCat(false); await fetchCategorias()
    } catch (e) {
      if (e.message?.toLowerCase().includes('unique')) setErrorCat('Ya existe una categoría con ese nombre.')
      else console.error(e)
    }
    setSavingCat(false)
  }

  async function toggleActivoCat(c) {
    try { await sql`UPDATE categorias_influencer SET activo=${!c.activo} WHERE id=${c.id}`; await fetchCategorias() }
    catch (e) { console.error(e) }
  }

  return (
    <div className="page-pad" style={{ maxWidth: 900 }}>

      {/* ── SERVICIOS ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Servicios</h1>
          <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {services.filter(s => s.activo).length} activos · {services.length} en total
          </p>
        </div>
        <button className="btn-red" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={openNewSvc}>+ Nuevo servicio</button>
      </div>

      {loadingSvc ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ background: '#F7F7F5', borderBottom: '0.5px solid #E5E5E2' }}>
                <th className="th" style={{ width: 200 }}>Servicio</th>
                <th className="th" style={{ width: 120 }}>% Utilizable</th>
                <th className="th" style={{ width: 120 }}>Margen agencia</th>
                <th className="th" style={{ width: 100 }}>Campañas</th>
                <th className="th" style={{ width: 90 }}>Estado</th>
                <th className="th" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {services.map(s => {
                const margenPct = 100 - Number(s.utilizable_pct)
                return (
                  <tr key={s.id} style={{ borderBottom: '0.5px solid #F0F0EE', opacity: s.activo ? 1 : 0.5 }}>
                    <td className="td">
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{s.nombre}</div>
                      {s.descripcion && <div style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{s.descripcion}</div>}
                    </td>
                    <td className="td"><span style={{ fontWeight: 500, fontSize: 14 }}>{fmtPct(s.utilizable_pct)}</span></td>
                    <td className="td"><span style={{ fontSize: 13, color: '#639922', fontWeight: 500 }}>{fmtPct(margenPct)}</span></td>
                    <td className="td"><span style={{ fontSize: 13, color: '#888' }}>{s.camp_count}</span></td>
                    <td className="td">
                      <span style={{ background: s.activo ? '#EAF3DE' : '#F1EFE8', color: s.activo ? '#27500A' : '#5F5E5A', padding: '2px 9px', borderRadius: 20, fontSize: 11 }}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="td">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-icon" onClick={() => openEditSvc(s)} title="Editar">✎</button>
                        <button className="btn-icon" onClick={() => toggleActivo(s)} title={s.activo ? 'Desactivar' : 'Activar'} style={{ fontSize: 12 }}>{s.activo ? '⏸' : '▶'}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </div>
      )}

      <div style={{ marginBottom: 40, padding: '12px 16px', background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 10, fontSize: 12, color: '#888' }}>
        <strong style={{ color: '#555' }}>¿Cómo funciona?</strong> — El % utilizable es el porcentaje del budget total destinado al costo real. El margen se calcula como <code>100% − % utilizable</code>. Al crear una campaña el porcentaje se guarda como snapshot histórico.
      </div>

      {/* ── CATEGORÍAS ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 500 }}>Categorías de influencers</h2>
          <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {categorias.filter(c => c.activo).length} activas · {categorias.length} en total
          </p>
        </div>
        <button className="btn-red" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={openNewCat}>+ Nueva categoría</button>
      </div>

      {loadingCat ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {categorias.map(c => {
            const col = catColor(c.nombre)
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 10,
                padding: '10px 14px', opacity: c.activo ? 1 : 0.45,
              }}>
                <span style={{ background: col.bg, color: col.color, padding: '2px 10px', borderRadius: 20, fontSize: 12.5, fontWeight: 500 }}>
                  {c.nombre}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-icon" onClick={() => openEditCat(c)} title="Editar" style={{ width: 26, height: 26, fontSize: 12 }}>✎</button>
                  <button className="btn-icon" onClick={() => toggleActivoCat(c)} title={c.activo ? 'Desactivar' : 'Activar'} style={{ width: 26, height: 26, fontSize: 11 }}>{c.activo ? '⏸' : '▶'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal servicios */}
      <Modal open={modalSvc} onClose={() => setModalSvc(false)} title={editSvcId ? 'Editar servicio' : 'Nuevo servicio'}>
        <div className="fg">
          <label className="label">Nombre del servicio</label>
          <input className="input" value={formSvc.nombre} onChange={e => setFormSvc(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: UGC, TikTok Ads" />
        </div>
        <div className="fg">
          <label className="label">Descripción (opcional)</label>
          <input className="input" value={formSvc.descripcion} onChange={e => setFormSvc(f => ({ ...f, descripcion: e.target.value }))} placeholder="Breve descripción" />
        </div>
        <div className="fg">
          <label className="label">% Utilizable</label>
          <input className="input" type="number" min="0" max="100" step="0.1" value={formSvc.utilizable_pct} onChange={e => setFormSvc(f => ({ ...f, utilizable_pct: e.target.value }))} placeholder="Ej: 65" />
        </div>
        {formSvc.utilizable_pct !== '' && (
          <div style={{ background: '#F7F7F5', border: '0.5px solid #E5E5E2', borderRadius: 10, padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Budget total</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>$1.000.000</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Utilizable</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{isNaN(parseFloat(formSvc.utilizable_pct)) ? '—' : '$' + Math.round(1000000 * parseFloat(formSvc.utilizable_pct) / 100).toLocaleString('es-CL')}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Margen agencia</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#639922' }}>{margenPreview}</div>
            </div>
          </div>
        )}
        <div className="fg">
          <label className="label">Estado</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map(v => (
              <div key={String(v)} onClick={() => setFormSvc(f => ({ ...f, activo: v }))}
                style={{ flex: 1, padding: '8px', borderRadius: 8, textAlign: 'center', cursor: 'pointer', fontSize: 13, userSelect: 'none', background: formSvc.activo === v ? (v ? '#EAF3DE' : '#FCEBEB') : '#F7F7F5', color: formSvc.activo === v ? (v ? '#27500A' : '#A32D2D') : '#AAA', border: `0.5px solid ${formSvc.activo === v ? (v ? '#8BC34A' : '#F7C1C1') : '#E5E5E2'}`, fontWeight: formSvc.activo === v ? 500 : 400 }}
              >{v ? 'Activo' : 'Inactivo'}</div>
            ))}
          </div>
        </div>
        {errorSvc && <div style={{ background: '#FCEBEB', border: '0.5px solid #F7C1C1', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#791F1F' }}>⚠ {errorSvc}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn-ghost" onClick={() => setModalSvc(false)}>Cancelar</button>
          <button className="btn-red" onClick={handleSaveSvc} disabled={savingSvc}>{savingSvc ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </Modal>

      {/* Modal categorías */}
      <Modal open={modalCat} onClose={() => setModalCat(false)} title={editCatId ? 'Editar categoría' : 'Nueva categoría'}>
        <div className="fg">
          <label className="label">Nombre de la categoría</label>
          <input className="input" value={formCat.nombre}
            onChange={e => setFormCat(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Cocina, Tecnología, Deportes" />
          {formCat.nombre.trim() && (
            <div style={{ marginTop: 8 }}>
              <span style={{ background: catColor(formCat.nombre.trim()).bg, color: catColor(formCat.nombre.trim()).color, padding: '3px 12px', borderRadius: 20, fontSize: 12.5 }}>
                {formCat.nombre.trim()}
              </span>
            </div>
          )}
        </div>
        {errorCat && <div style={{ background: '#FCEBEB', border: '0.5px solid #F7C1C1', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#791F1F' }}>⚠ {errorCat}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn-ghost" onClick={() => setModalCat(false)}>Cancelar</button>
          <button className="btn-red" onClick={handleSaveCat} disabled={savingCat}>{savingCat ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </Modal>

    </div>
  )
}
