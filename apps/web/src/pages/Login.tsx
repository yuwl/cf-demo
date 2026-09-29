import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api'
import { useAuth } from '../auth'

interface Props {
  navigate: (path: string) => void
}

export default function LoginPage({ navigate }: Props) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page page--narrow">
      <header className="hero">
        <h1>登录</h1>
        <p className="muted">cf-demo 留言板 · Cloudflare 全栈示例</p>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field">
          <span>邮箱</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p className="alert alert--error">{error}</p> : null}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>

        <p className="muted small">
          还没有账号？
          <a
            href="/register"
            onClick={(e) => {
              e.preventDefault()
              navigate('/register')
            }}
          >
            去注册
          </a>
        </p>
      </form>
    </div>
  )
}
