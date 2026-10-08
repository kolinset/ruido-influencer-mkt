import { useState, useEffect } from 'react'
import supabase from './lib/supabaseClient'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Roster from './components/Roster'
import Campanas from './components/Campanas'
import Clientes from './components/Clientes'
import ClienteDashboard from './components/ClienteDashboard'
import Servicios from './components/Servicios'
import PagosGlobales from './components/PagosGlobales'
import VistaCliente from './components/VistaCliente'
import VistaReporte from './components/VistaReporte'
import VistaClienteDashboard from './components/VistaClienteDashboard'
import VistaEditor from './components/VistaEditor'
import SocialBoost from './components/SocialBoost'
import './index.css'

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

  if (publicToken) return <VistaCliente token={publicToken} />
  if (reportToken) return <VistaReporte token={reportToken} />
  if (clientDashboardToken) return <VistaClienteDashboard token={clientDashboardToken} />
  if (editorToken) return <VistaEditor token={editorToken} />

  if (!auth) return <Login onLogin={() => setAuth(true)} />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F7F7F5' }}>
      <Sidebar page={page} setPage={handleSetPage} onLogout={handleLogout} />
      <main style={{ flex: 1, minWidth: 0, paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom))' : 0 }}>
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
      </main>
    </div>
  )
}
