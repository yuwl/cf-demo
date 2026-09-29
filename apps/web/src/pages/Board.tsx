import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { ApiError, api, uploadAvatar } from '../api'
import { useAuth } from '../auth'
import type { HealthResponse, PublicMessage } from '../types'

interface Props {
  navigate: (path: string) => void
}

const MAX_CONTENT = 500

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return <img className="avatar" src={url} alt="" width={size} height={size} />
  }
  return (
    <span
      className="avatar avatar--fallback"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function BoardPage({ navigate }: Props) {
  const { user, setUser, logout } = useAuth()
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [features, setFeatures] = useState<HealthResponse['features'] | null>(null)

  // R2 / 邮件是否启用属于部署期配置，挂载时取一次就够了，不会中途变化
  useEffect(() => {
    let alive = true
    void api
      .health()
      .then((result) => {
        if (alive) setFeatures(result.features)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.listMessages(null)
      setMessages(page.items)
      setCursor(page.nextCursor)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载留言失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  async function handleLoadMore() {
    if (!cursor || loading) return
    setLoading(true)
    try {
      const page = await api.listMessages(cursor)
      setMessages((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载更多失败')
    } finally {
      setLoading(false)
    }
  }

  async function handlePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = content.trim()
    if (text.length === 0) return

    setPosting(true)
    setError(null)
    setNotice(null)
    try {
      const { message } = await api.createMessage(text)
      setMessages((prev) => [message, ...prev])
      setContent('')
      setNotice('留言已发布')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发布失败')
    } finally {
      setPosting(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    setNotice(null)
    try {
      await api.deleteMessage(id)
      setMessages((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除失败')
    }
  }

  async function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 清空 value，这样连续选同一个文件也能触发 change
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await uploadAvatar(file)
      setUser(updated)
      setNotice('头像已更新')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '头像上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>留言板</h1>
          <p className="muted small">
            {[
              'Pages',
              'Workers',
              'D1',
              ...(features?.avatarUpload ? ['R2'] : []),
              ...(features?.mail ? ['Resend'] : []),
            ].join(' + ')}
          </p>
        </div>

        {user ? (
          <div className="userbox">
            <Avatar url={user.avatarUrl} name={user.displayName} />
            <div className="userbox__meta">
              <strong>{user.displayName}</strong>
              <span className="muted small">
                {user.emailVerified ? '邮箱已验证' : '邮箱未验证'}
              </span>
            </div>
            {features && !features.avatarUpload ? (
              <span className="muted small" title="当前部署未绑定 R2 存储桶">
                头像功能未启用
              </span>
            ) : (
              <label className={`btn btn--ghost${uploading ? ' is-disabled' : ''}`}>
                {uploading ? '上传中…' : '换头像'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatar}
                  disabled={uploading}
                  hidden
                />
              </label>
            )}
            <button className="btn btn--ghost" type="button" onClick={logout}>
              退出
            </button>
          </div>
        ) : (
          <div className="userbox">
            <button className="btn btn--ghost" type="button" onClick={() => navigate('/login')}>
              登录
            </button>
            <button className="btn btn--primary" type="button" onClick={() => navigate('/register')}>
              注册
            </button>
          </div>
        )}
      </header>

      {user ? (
        <form className="card composer" onSubmit={handlePost}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`说点什么吧，${user.displayName}…`}
            maxLength={MAX_CONTENT}
            rows={3}
          />
          <div className="composer__foot">
            <span className="muted small">
              {content.length} / {MAX_CONTENT}
            </span>
            <button
              className="btn btn--primary"
              type="submit"
              disabled={posting || content.trim().length === 0}
            >
              {posting ? '发布中…' : '发布'}
            </button>
          </div>
        </form>
      ) : (
        <div className="card">
          <p className="muted">登录后即可发表留言。</p>
        </div>
      )}

      {error ? <p className="alert alert--error">{error}</p> : null}
      {notice ? <p className="alert alert--ok">{notice}</p> : null}

      <section className="list">
        {messages.length === 0 && !loading ? (
          <p className="muted center">还没有留言，来写第一条。</p>
        ) : null}

        {messages.map((item) => (
          <article className="card message" key={item.id}>
            <Avatar url={item.author.avatarUrl} name={item.author.displayName} size={40} />
            <div className="message__body">
              <div className="message__head">
                <strong>{item.author.displayName}</strong>
                <span className="muted small">{formatTime(item.createdAt)}</span>
                {user?.id === item.author.id ? (
                  <button
                    className="link"
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                  >
                    删除
                  </button>
                ) : null}
              </div>
              <p className="message__text">{item.content}</p>
            </div>
          </article>
        ))}
      </section>

      {cursor ? (
        <button
          className="btn btn--ghost center"
          type="button"
          onClick={() => void handleLoadMore()}
          disabled={loading}
        >
          {loading ? '加载中…' : '加载更多'}
        </button>
      ) : null}
    </div>
  )
}
