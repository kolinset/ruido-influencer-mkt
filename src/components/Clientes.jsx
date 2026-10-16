import { useState, useEffect } from 'react'
import sql from '../lib/db'
import Modal from './Modal'

const AV_COLORS = [
  { bg: '#F4D3AE', color: '#8A2E0C' },
  { bg: '#F6DCC4', color: '#3A1608' },
  { bg: '#F9C99A', color: '#8A2E0C' },
  { bg: '#EFD9C8', color: '#C4501A' },
  { bg: '#F2C3A0', color: '#3A1608' },
  { bg: '#FBE6CF', color: '#C4501A' },
  { bg: '#E9C6A8', color: '#3A1608' },
  { bg: '#F7D9B8', color: '#8A2E0C' },
]

const PRESET_COLORS = [
  '#C4501A', '#3B5BDB', '#1D9E75', '#7C3AED',
  '#BA7517', '#C2185B', '#0369A1', '#2E7D32',
  '#111111', '#E87D1E',
]

function generateSlug(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function ClientAvatar({ nombre, color, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: color || '#C4501A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0,
      letterSpacing: '-.02em',
    }}>
      {nombre?.slice(0, 2).toUpperCase()}
    </div>
  )
}

const EMPTY_FORM = { nombre: '', color: '#C4501A', logo_url: '' }

export default function Clientes({ onSelectCliente }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    try {
      const data = await sql`
        SELECT
          c.*,
          COUNT(DISTINCT camp.id) AS total_campanas,
          COUNT(DISTINCT CASE WHEN camp.estado = 'Activa' THEN camp.id END) AS campanas_activas
        FROM clients c
        LEFT JOIN campaigns camp ON camp.client_id = c.id
        GROUP BY c.id
        ORDER BY c.nombre ASC
      `
      setClients(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setModalOpen(true)
  }

  function openEdit(client) {
    setForm({ nombre: client.nombre, color: client.color || '#C4501A', logo_url: client.logo_url || '' })
    setEditId(client.id)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return
    setSaving(true)
    try {
      const slug = generateSlug(form.nombre)
      if (editId) {
        await sql`
          UPDATE clients SET
            nombre = ${form.nombre},
            color = ${form.color},
            logo_url = ${form.logo_url},
            slug = ${slug}
          WHERE id = ${editId}
        `
      } else {
        await sql`
          INSERT INTO clients (nombre, slug, color, logo_url)
          VALUES (${form.nombre}, ${slug}, ${form.color}, ${form.logo_url})
        `
      }
      setModalOpen(false)
      await fetchClients()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  async function handleDelete(id) {
    try {
      // Desasignar campañas antes de eliminar
      await sql`UPDATE campaigns SET client_id = NULL WHERE client_id = ${id}`
      await sql`DELETE FROM clients WHERE id = ${id}`
      setDeleteId(null)
      await fetchClients()
    } catch (e) { console.error(e) }
  }

  const filtered = clients.filter(c =>
    !search || c.nombre.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Clientes</h1>
          <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{clients.length} clientes registrados</p>
        </div>
        <button className="btn-red" onClick={openNew}>+ Nuevo cliente</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Buscar cliente..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 300 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#AAA', fontSize: 13 }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#AAA', fontSize: 13 }}>
          {search ? 'Sin resultados' : 'No hay clientes. Agrega el primero.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map((client, i) => (
            <div key={client.id} className="card"
              style={{ padding: 20, cursor: 'pointer', transition: 'all .15s' }}
              onClick={() => onSelectCliente(client)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = client.color || '#C4501A'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E5E2'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ClientAvatar nombre={client.nombre} color={client.color} size={44} />
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#1A1A1A' }}>{client.nombre}</div>
                    <div style={{ fontSize: 11, color: '#AAA', marginTop: 2 }}>/{client.slug}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-icon"
                    onClick={e => { e.stopPropagation(); openEdit(client) }}
                    title="Editar">✎</button>
                  <button className="btn-icon btn-icon-danger"
                    onClick={e => { e.stopPropagation(); setDeleteId(client.id) }}
                    title="Eliminar">✕</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Campañas</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{client.total_campanas}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#AAA', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Activas</div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: Number(client.campanas_activas) > 0 ? '#27500A' : '#1A1A1A' }}>
                    {client.campanas_activas}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '0.5px solid #F0F0EE', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#AAA' }}>Ver campañas →</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color || '#C4501A' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="fg">
          <label className="label">Nombre</label>
          <input className="input" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Universal Music Chile" />
        </div>
        <div className="fg">
          <label className="label">Color de marca</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {PRESET_COLORS.map(c => (
              <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{
                  width: 28, height: 28, borderRadius: 8, background: c, cursor: 'pointer',
                  border: form.color === c ? '2.5px solid #1A1A1A' : '2px solid transparent',
                  transition: 'all .12s',
                }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              style={{ width: 36, height: 36, borderRadius: 8, border: '0.5px solid #E5E5E2', cursor: 'pointer', padding: 2 }} />
            <input className="input" value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              placeholder="#C4501A" style={{ fontFamily: 'monospace', maxWidth: 120 }} />
            <div style={{ width: 36, height: 36, borderRadius: 8, background: form.color, border: '0.5px solid #E5E5E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
              {form.nombre?.slice(0, 2).toUpperCase() || 'AB'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn-red" onClick={handleSave} disabled={saving || !form.nombre.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>

      {/* Modal eliminar */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Eliminar cliente">
        <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
          ¿Eliminar este cliente? Sus campañas quedarán sin cliente asignado pero no se eliminarán.
        </p>
        <p style={{ fontSize: 12, color: '#AAA', marginBottom: 20 }}>Esta acción no se puede deshacer.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setDeleteId(null)}>Cancelar</button>
          <button className="btn-danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
        </div>
      </Modal>
    </div>
  )
}
