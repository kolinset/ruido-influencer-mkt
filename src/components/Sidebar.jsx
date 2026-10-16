import { useEffect, useState } from 'react'

const ALL_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'roster',    label: 'Roster',    icon: '◉' },
  { id: 'campanas',  label: 'Campañas',  icon: '◎' },
  { id: 'clientes',  label: 'Clientes',  icon: '◍' },
  { id: 'servicios', label: 'Servicios', icon: '◐' },
]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 720 : false
  )
  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 720) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function Sidebar({ page, setPage, onLogout }) {
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: '◈' },
    { id: 'roster',    label: 'Roster',    icon: '◉' },
  ]
  const clientItems = [
    { id: 'clientes',  label: 'Clientes',  icon: '◍' },
    { id: 'campanas',  label: 'Campañas',  icon: '◎' },
    { id: 'servicios', label: 'Servicios', icon: '◐' },
    { id: 'socialboost', label: 'Social Boost', icon: '♪' },
  ]

  // ─── MOBILE: barra inferior + menú deslizable ───
  if (isMobile) {
    const currentItem = ALL_ITEMS.find(i => i.id === page) || ALL_ITEMS[0]

    return (
      <>
        {/* Overlay */}
        {menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 100, backdropFilter: 'blur(2px)',
            }}
          />
        )}

        {/* Panel deslizable desde abajo */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(253, 244, 233, 0.88)', borderRadius: '26px 26px 0 0',
          WebkitBackdropFilter: 'blur(30px) saturate(170%)', backdropFilter: 'blur(30px) saturate(170%)',
          boxShadow: '0 -8px 30px rgba(58,22,8,0.16)',
          zIndex: 101, padding: '12px 0 32px',
          transform: menuOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
        }}>
          {/* Handle */}
          <div style={{ width: 36, height: 4, background: '#E5E5E2', borderRadius: 2, margin: '0 auto 16px' }} />

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 14px', borderBottom: '0.5px solid #F0F0EE' }}>
            <div style={{ width: 28, height: 28, background: '#C4501A', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>K</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>KOLINSET</div>
              <div style={{ fontSize: 11, color: '#AAA' }}>Influencer MKT</div>
            </div>
          </div>

          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#CCC', padding: '8px 8px 4px' }}>Principal</div>
            {items.map(item => (
              <div key={item.id}
                onClick={() => { setPage(item.id); setMenuOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 10px', borderRadius: 10, cursor: 'pointer',
                  background: page === item.id ? 'rgba(196,80,26,0.12)' : 'transparent',
                  color: page === item.id ? '#8A2E0C' : '#444',
                  fontSize: 14.5, marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}

            <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#CCC', padding: '12px 8px 4px' }}>Clientes</div>
            {clientItems.map(item => (
              <div key={item.id}
                onClick={() => { setPage(item.id); setMenuOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 10px', borderRadius: 10, cursor: 'pointer',
                  background: page === item.id ? 'rgba(196,80,26,0.12)' : 'transparent',
                  color: page === item.id ? '#8A2E0C' : '#444',
                  fontSize: 14.5, marginBottom: 2,
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}

            <div style={{ borderTop: '0.5px solid #F0F0EE', marginTop: 8, paddingTop: 8 }}>
              <div onClick={() => { onLogout(); setMenuOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 10, cursor: 'pointer', color: '#AAA', fontSize: 14.5 }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>→</span>
                Cerrar sesión
              </div>
            </div>
          </div>
        </div>

        {/* Barra de navegación fija en la parte inferior */}
        <div className="glass-panel" style={{
          position: 'fixed', left: 10, right: 10, bottom: 'calc(8px + env(safe-area-inset-bottom))',
          borderRadius: 22, display: 'flex', alignItems: 'center',
          padding: '0 4px', zIndex: 99, height: 58,
        }}>
          {ALL_ITEMS.map(item => {
            const isActive = page === item.id
            return (
              <div key={item.id}
                onClick={() => setPage(item.id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: '6px 0', cursor: 'pointer',
                  color: isActive ? '#C4501A' : '#AAA',
                }}
              >
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                <span style={{ fontSize: 9.5, fontWeight: isActive ? 500 : 400, letterSpacing: '.02em' }}>{item.label}</span>
              </div>
            )
          })}
          {/* Botón menú / más */}
          <div
            onClick={() => setMenuOpen(o => !o)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 0', cursor: 'pointer',
              color: menuOpen ? '#C4501A' : '#AAA',
            }}
          >
            <span style={{ fontSize: 17 }}>☰</span>
            <span style={{ fontSize: 9.5, letterSpacing: '.02em' }}>Menú</span>
          </div>
        </div>

        {/* Espaciado inferior para que el contenido no quede tapado por la barra */}
        <div style={{ height: 'calc(56px + env(safe-area-inset-bottom))' }} />
      </>
    )
  }

  // ─── DESKTOP: panel de vidrio flotante ───
  const navItem = item => {
    const active = page === item.id
    return (
      <div key={item.id} onClick={() => setPage(item.id)} className={'nav-item' + (active ? ' nav-item-active' : '')}>
        <span className="nav-icon">{item.icon}</span>
        {item.label}
      </div>
    )
  }

  return (
    <aside className="glass-panel" style={{
      width: 220, margin: 14, marginRight: 0, borderRadius: 26,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      position: 'sticky', top: 14, height: 'calc(100vh - 28px)',
    }}>
      <div style={{ padding: '22px 18px 18px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div className="brand-mark">K</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.02em' }}>KOLINSET</div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>Influencer MKT</div>
        </div>
      </div>

      <nav style={{ padding: '4px 10px', flex: 1, overflowY: 'auto' }}>
        <div className="nav-section">Principal</div>
        {items.map(navItem)}
        <div className="nav-section" style={{ marginTop: 10 }}>Clientes</div>
        {clientItems.map(navItem)}
      </nav>

      <div style={{ padding: 10 }}>
        <div onClick={onLogout} className="nav-item nav-item-logout">
          <span className="nav-icon">→</span>
          Cerrar sesión
        </div>
      </div>
    </aside>
  )
}
