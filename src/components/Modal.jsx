export default function Modal({ open, onClose, title, children }) {
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)',
        zIndex: 200, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', paddingTop: 60,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'rgba(24, 18, 16, 0.88)', border: '0.5px solid rgba(244,211,174,0.14)',
        WebkitBackdropFilter: 'blur(30px) saturate(170%)', backdropFilter: 'blur(30px) saturate(170%)',
        borderRadius: 24, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '0.5px solid rgba(244,211,174,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 999,
              border: 'none', background: 'rgba(244,211,174,0.08)',
              cursor: 'pointer', fontSize: 14, color: '#888',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
