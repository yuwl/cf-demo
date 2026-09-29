import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { useAuth } from '../auth'

interface Props {
  navigate: (path: string) => void
}

type Status = 'pending' | 'ok' | 'fail'

export default function VerifyEmailPage({ navigate }: Props) {
  const { refresh } = useAuth()
  const [status, setStatus] = useState<Status>('pending')
  const [message, setMessage] = useState('正在验证邮箱…')
  const started = useRef(false)

  useEffect(() => {
    // StrictMode 下 effect 会跑两次，这里保证令牌只被消费一次
    if (started.current) return
    started.current = true

    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setStatus('fail')
      setMessage('链接里缺少 token 参数，请从邮件里重新打开')
      return
    }

    void (async () => {
      try {
        await api.verifyEmail(token)
        await refresh()
        setStatus('ok')
        setMessage('邮箱验证成功')
      } catch (error) {
        setStatus('fail')
        setMessage(error instanceof ApiError ? error.message : '验证失败，请稍后重试')
      }
    })()
  }, [refresh])

  return (
    <div className="page page--narrow">
      <header className="hero">
        <h1>邮箱验证</h1>
      </header>

      <div className="card">
        <p
          className={
            status === 'ok'
              ? 'alert alert--ok'
              : status === 'fail'
                ? 'alert alert--error'
                : 'alert'
          }
        >
          {message}
        </p>

        <button className="btn btn--primary" type="button" onClick={() => navigate('/')}>
          回到留言板
        </button>
      </div>
    </div>
  )
}
