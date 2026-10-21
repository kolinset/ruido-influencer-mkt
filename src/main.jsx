import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'))

// Computadores modestos (4 núcleos o menos, o poca memoria): versión sin desenfoques para que vaya fluida
if ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) {
  document.documentElement.classList.add('lite')
}

// Sin estas variables la app no puede conectarse a Supabase y quedaría en blanco.
// (Pasa típicamente en las vistas previas de Vercel si las variables solo están en "Production".)
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  root.render(
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center', color: '#555' }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Falta configurar la conexión</div>
        <div style={{ fontSize: 13 }}>Este sitio no tiene las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.<br />En Vercel: Settings → Environment Variables.</div>
      </div>
    </div>
  )
} else {
  import('./App.jsx').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
}
