import type {
  AuthResponse,
  HealthResponse,
  MessagePage,
  PublicMessage,
  PublicUser,
  RegisterResponse,
  UploadTicket,
} from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787').replace(
  /\/+$/,
  '',
)

// 构建时忘了配 VITE_API_BASE_URL 的话，线上会去请求 localhost，
// 这里给一条明确的控制台线索，免得对着一堆网络错误猜。
if (import.meta.env.PROD && API_BASE.includes('localhost')) {
  console.warn(
    `[cf-demo] 生产构建仍在用 ${API_BASE} 作为后端地址，` +
      '请在部署环境设置 VITE_API_BASE_URL 指向你的 Workers 域名。',
  )
}

const TOKEN_KEY = 'cf-demo.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  const token = getToken()
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  }
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, `连不上后端接口（${API_BASE}），确认 API 已启动且 CORS 白名单包含当前地址`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json().catch(() => null)) as { error?: string } | null

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? `请求失败（HTTP ${response.status}）`)
  }

  return payload as T
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),

  register: (input: {
    email: string
    password: string
    displayName: string
    /** 后端配了 REGISTER_CODE 时必填 */
    inviteCode?: string
  }) =>
    request<RegisterResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  me: () => request<{ user: PublicUser }>('/api/auth/me'),

  verifyEmail: (token: string) =>
    request<{ ok: boolean }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  listMessages: (cursor?: string | null) => {
    const params = new URLSearchParams({ limit: '20' })
    if (cursor) params.set('cursor', cursor)
    return request<MessagePage>(`/api/messages?${params.toString()}`)
  },

  createMessage: (content: string) =>
    request<{ message: PublicMessage }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (id: string) => request<void>(`/api/messages/${id}`, { method: 'DELETE' }),

  requestAvatarUpload: (file: File) =>
    request<UploadTicket>('/api/uploads/avatar', {
      method: 'POST',
      body: JSON.stringify({ contentType: file.type, size: file.size }),
    }),

  confirmAvatar: (key: string) =>
    request<{ user: PublicUser }>('/api/uploads/avatar/confirm', {
      method: 'POST',
      body: JSON.stringify({ key }),
    }),
}

/**
 * 头像上传完整流程：
 * 1. 向后端申请上传目标（预签名 URL 或降级为 Worker 中转）
 * 2. 按返回的 mode 把文件送上去
 * 3. 调 confirm 把对象 key 落到用户记录
 */
export async function uploadAvatar(file: File): Promise<PublicUser> {
  const ticket = await api.requestAvatarUpload(file)

  if (ticket.mode === 'presigned') {
    // 直传 R2：注意不能带 Authorization，否则会破坏预签名
    const put = await fetch(ticket.uploadUrl, { method: 'PUT', body: file })
    if (!put.ok) {
      throw new ApiError(put.status, `直传 R2 失败（HTTP ${put.status}）`)
    }
  } else {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(ticket.uploadUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${getToken() ?? ''}` },
      body: form,
    })
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      throw new ApiError(res.status, payload?.error ?? '上传失败')
    }
  }

  const { user } = await api.confirmAvatar(ticket.key)
  return user
}
