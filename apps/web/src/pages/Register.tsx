import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, api } from '../api'
import type { RegisterResponse } from '../types'

interface Props {
  navigate: (path: string) => void
}

export default function RegisterPage({ navigate }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [codeRequired, setCodeRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RegisterResponse | null>(null)

  // 后端配了注册口令才显示输入框，没配就不给用户添堵
  useEffect(() => {
    let alive = true
    void api
      .health()
      .then((health) => {
        if (alive) setCodeRequired(health.features.registerCodeRequired)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const response = await api.register({
        email,
        password,
        displayName,
        inviteCode: codeRequired ? inviteCode : undefined,
      })
      setResult(response)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '注册失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="page page--narrow">
        <header className="hero">
          <h1>注册成功</h1>
          <p className="muted">{result.user.email}</p>
        </header>

        <div className="card">
          <p className={result.mailSent ? 'alert alert--ok' : 'alert alert--warn'}>
            {result.mailSent ? '验证邮件已发送，请查收邮箱。' : result.mailDetail}
          </p>

          {result.devVerifyLink ? (
            <p className="small muted">
              本地演示环境没有真实邮件通道，可以直接点这个链接完成验证：
              <br />
              <a
                href={result.devVerifyLink}
                onClick={(e) => {
                  e.preventDefault()
                  const token = new URL(result.devVerifyLink as string, window.location.origin)
                    .searchParams.get('token')
                  navigate(`/verify-email?token=${token ?? ''}`)
                }}
              >
                打开验证链接
              </a>
            </p>
          ) : null}

          <button className="btn btn--primary" type="button" onClick={() => navigate('/login')}>
            去登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--narrow">
      <header className="hero">
        <h1>注册</h1>
        <p className="muted">注册后需要验证邮箱才能收到通知</p>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field">
          <span>昵称</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="显示在留言上的名字"
            maxLength={40}
            required
          />
        </label>

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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {codeRequired ? (
          <label className="field">
            <span>注册口令</span>
            <input
              type="password"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="请输入邀请口令"
              autoComplete="off"
              required
            />
          </label>
        ) : null}

        {error ? <p className="alert alert--error">{error}</p> : null}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? '提交中…' : '注册'}
        </button>

        <p className="muted small">
          已经有账号了？
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault()
              navigate('/login')
            }}
          >
            去登录
          </a>
        </p>
      </form>
    </div>
  )
}
