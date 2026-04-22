import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { setAuth } from '../lib/auth.js'
import type { Operator } from '../types.js'

export default function Register() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!token) {
      setError('Invalid invite link')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const res = await api.post<{ token: string; operator: Operator }>('/auth/register', {
        inviteToken: token,
        name,
        password,
      })
      setAuth(res.token, res.operator)
      navigate('/conversations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>DaChat</h1>
        <p style={styles.subtitle}>Set up your account</p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Full name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              placeholder="Jane Smith"
              autoComplete="name"
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={styles.input}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p style={styles.footer}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-secondary)',
  },
  card: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '40px 36px',
    width: 380,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 4,
    color: 'var(--accent)',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    marginBottom: 24,
  },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: 'var(--danger)',
    borderRadius: 6,
    padding: '10px 12px',
    marginBottom: 16,
    fontSize: 13,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontWeight: 500,
    color: 'var(--text)',
  },
  input: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '9px 12px',
    outline: 'none',
    color: 'var(--text)',
    background: 'var(--bg)',
  },
  button: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 16px',
    fontWeight: 600,
    marginTop: 8,
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: 13,
  },
}
