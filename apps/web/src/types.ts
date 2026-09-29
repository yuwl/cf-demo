export interface PublicUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  emailVerified: boolean
  createdAt: number
}

export interface PublicMessage {
  id: string
  content: string
  createdAt: number
  author: {
    id: string
    displayName: string
    avatarUrl: string | null
  }
}

export interface AuthResponse {
  token: string
  user: PublicUser
}

export interface RegisterResponse {
  user: PublicUser
  mailSent: boolean
  mailDetail: string
  devVerifyLink?: string
}

export interface MessagePage {
  items: PublicMessage[]
  nextCursor: string | null
}

export interface UploadTicket {
  mode: 'presigned' | 'proxy'
  key: string
  uploadUrl: string
  maxBytes: number
  expiresIn?: number
  note: string
}

/** /api/health 返回的部署能力开关（R2、邮件、注册口令是否启用） */
export interface HealthResponse {
  ok: boolean
  service: string
  ts: number
  features: {
    avatarUpload: boolean
    mail: boolean
    registerCodeRequired: boolean
  }
}
