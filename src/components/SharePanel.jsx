import { useState } from 'react'
import sql from '../lib/db'

export default function SharePanel({ camp, onUpdate }) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const baseUrl = window.location.origin + '/?token='
  const fullUrl = baseUrl + camp.share_token

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copia este link:', fullUrl)
    }
  }

  async function toggleActive() {
    setLoading(true)
    try {
      await sql`UPDATE campaigns SET share_active = ${!camp.share_active} WHERE id = ${camp.id}`
      onUpdate()
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function regenerate() {
    setLoading(true)
    try {
      await sql`UPDATE campaigns SET share_token = ${crypto.randomUUID()} WHERE id = ${camp.id}`
      onUpdate()
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div style={{
      background: '#fff', border: '0.5px solid #E5E5E2', borderRadius: 12,
      padding: '16px 18px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Link para cliente</div>
        <span style={{
          fontSize: 11, padding: '2px 9px', borderRadius: 20,
          background: camp.share_active ? '#EAF3DE' : '#F1EFE8',
          color: camp.share_active ? '#27500A' : '#5F5E5A',
        }}>
          {camp.share_active ? 'Activo' : 'Desactivado'}
        </span>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#F7F7F5', border: '0.5px solid #E5E5E2',
        borderRadius: 8, padding: '8px 12px', marginBottom: 12,
      }}>
        <span style={{ flex: 1, fontSize: 12, color: '#666', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fullUrl}
        </span>
        <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12, flexShrink: 0 }} onClick={copyLink}>
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-ghost" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={toggleActive} disabled={loading}>
          {camp.share_active ? 'Desactivar link' : 'Activar link'}
        </button>
        <button className="btn-ghost" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={regenerate} disabled={loading}>
          Regenerar link
        </button>
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 'auto', fontSize: 12, color: '#C4501A', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
        >
          Vista previa ↗
        </a>
      </div>
    </div>
  )
}
