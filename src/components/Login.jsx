import { useState } from 'react'
import supabase from '../lib/supabaseClient'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email o contraseña incorrectos.')
      setPassword('')
    } else {
      onLogin()
    }
    setLoading(false)
  }

  return (
    <div className="glass-app" style={{
      minHeight: '100vh', padding: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', border: '0.5px solid #E5E5E2',
        borderRadius: 28, padding: '40px 34px', width: '100%', maxWidth: 380,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, background: 'linear-gradient(145deg, #FF6A5C, #E8313A 60%, #B81D2A)', borderRadius: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: '#fff', boxShadow: '0 6px 16px rgba(232,49,58,0.35)',
          }}>K</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>KOLINSET</div>
            <div style={{ fontSize: 11, color: '#AAA' }}>Influencer MKT</div>
          </div>
        </div>

        <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 6 }}>Bienvenido</h1>
        <p style={{ fontSize: 13, color: '#AAA', marginBottom: 24 }}>Ingresá con tu cuenta para acceder.</p>

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="nombre@kolinset.com"
              autoFocus
            />
          </div>

          <div className="fg">
            <label className="label">Contraseña</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="••••••••"
              style={{
                borderColor: error ? '#E8313A' : undefined,
                background: error ? '#FCEBEB' : undefined,
              }}
            />
            {error && (
              <div style={{ fontSize: 12, color: '#A32D2D', marginTop: 4 }}>
                {error}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn-red"
            disabled={loading || !password || !email}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
