export default function Modal({ open, onClose, title, children }) {
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(58,22,8,0.22)',
        WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)',
        zIndex: 200, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', paddingTop: 60,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'rgba(253, 244, 233, 0.86)', border: '0.5px solid rgba(255,255,255,0.9)',
        WebkitBackdropFilter: 'blur(30px) saturate(170%)', backdropFilter: 'blur(30px) saturate(170%)',
        borderRadius: 24, width: '100%', maxWidth: 480,
        maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(58,22,8,0.24)',
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '0.5px solid rgba(58,22,8,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 999,
              border: 'none', background: 'rgba(58,22,8,0.07)',
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
