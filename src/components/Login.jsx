import { useState } from 'react'
import supabase from '../lib/supabaseClient'
import Logo from './Logo'

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
        <div style={{ marginBottom: 30 }}>
          <Logo height={24} dark />
          <div style={{ fontSize: 11, color: '#AAA', marginTop: 8, letterSpacing: '.08em', textTransform: 'uppercase' }}>Influencer MKT</div>
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
                borderColor: error ? '#C4501A' : undefined,
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
