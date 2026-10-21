import { useState, useEffect, lazy, Suspense } from 'react'
import supabase from './lib/supabaseClient'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import './index.css'

// Cada página se descarga recién cuando se abre (así la app carga más rápido)
const Dashboard = lazy(() => import('./components/Dashboard'))
const Roster = lazy(() => import('./components/Roster'))
const Campanas = lazy(() => import('./components/Campanas'))
const Clientes = lazy(() => import('./components/Clientes'))
const ClienteDashboard = lazy(() => import('./components/ClienteDashboard'))
const Servicios = lazy(() => import('./components/Servicios'))
const PagosGlobales = lazy(() => import('./components/PagosGlobales'))
const VistaCliente = lazy(() => import('./components/VistaCliente'))
const VistaReporte = lazy(() => import('./components/VistaReporte'))
const VistaClienteDashboard = lazy(() => import('./components/VistaClienteDashboard'))
const VistaEditor = lazy(() => import('./components/VistaEditor'))
const SocialBoost = lazy(() => import('./components/SocialBoost'))

const Cargando = () => <div style={{ padding: 40, color: '#AAA', fontSize: 13 }}>Cargando…</div>

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

export default function App() {
  const isMobile = useIsMobile()
  const [auth, setAuth] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [publicToken, setPublicToken] = useState(null)
  const [reportToken, setReportToken] = useState(null)
  const [clientDashboardToken, setClientDashboardToken] = useState(null)
  const [editorToken, setEditorToken] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [campanaFromClient, setCampanaFromClient] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const report = params.get('report')
    const clientDash = params.get('clientDashboard')
    const editor = params.get('editor')
    if (token) { setPublicToken(token); return }
    if (report) { setReportToken(report); return }
    if (clientDash) { setClientDashboardToken(clientDash); return }
    if (editor) { setEditorToken(editor); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuth(!!session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(!!session)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  function handleLogout() {
    supabase.auth.signOut()
    setAuth(false)
  }

  function handleSelectCliente(client) {
    setSelectedClient(client)
    setPage('cliente-detail')
  }

  function handleOpenCampanaFromClient(camp) {
    setCampanaFromClient(camp)
    setPage('campanas')
  }

  function handleSetPage(p) {
    setSelectedClient(null)
    setCampanaFromClient(null)
    setPage(p)
  }

  if (publicToken) return <><Ambient /><Suspense fallback={<Cargando />}><VistaCliente token={publicToken} /></Suspense></>
  if (reportToken) return <><Ambient /><Suspense fallback={<Cargando />}><VistaReporte token={reportToken} /></Suspense></>
  if (clientDashboardToken) return <><Ambient /><Suspense fallback={<Cargando />}><VistaClienteDashboard token={clientDashboardToken} /></Suspense></>
  if (editorToken) return <><Ambient /><Suspense fallback={<Cargando />}><VistaEditor token={editorToken} /></Suspense></>

  if (!auth) return <><Ambient /><Login onLogin={() => setAuth(true)} /></>

  return (
    <>
    <Ambient />
    <div className="glass-app" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar page={page} setPage={handleSetPage} onLogout={handleLogout} />
      <main style={{ flex: 1, minWidth: 0, paddingBottom: isMobile ? 'calc(76px + env(safe-area-inset-bottom))' : 0 }}>
        <Suspense fallback={<Cargando />}>
        {page === 'dashboard'      && <Dashboard onNavigate={setPage} />}
        {page === 'roster'         && <Roster />}
        {page === 'campanas'       && <Campanas initialCamp={campanaFromClient} />}
        {page === 'clientes'       && <Clientes onSelectCliente={handleSelectCliente} />}
        {page === 'servicios'      && <Servicios />}
        {page === 'socialboost'    && <SocialBoost />}
        {page === 'pagos-globales' && <PagosGlobales onBack={() => handleSetPage('dashboard')} />}
        {page === 'cliente-detail' && selectedClient && (
          <ClienteDashboard
            client={selectedClient}
            onBack={() => setPage('clientes')}
            onOpenCampaign={handleOpenCampanaFromClient}
          />
        )}
        </Suspense>
      </main>
    </div>
    </>
  )
}

// Fondo con luces difuminadas detrás de los paneles de vidrio
function Ambient() {
  return <div className="ambient" aria-hidden="true"><span className="o1" /><span className="o2" /><span className="o3" /><span className="o4" /></div>
}
