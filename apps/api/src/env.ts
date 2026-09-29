/**
 * Workers 运行时注入的绑定与变量类型。
 *
 * - DB 来自 wrangler.jsonc 的 d1_databases 绑定
 * - BUCKET 来自 r2_buckets 绑定，但 R2 是**可选**的：
 *   Cloudflare 要求先绑定支付方式才能启用 R2，所以 wrangler.jsonc 里
 *   这一段默认被注释掉，此时 env.BUCKET 为 undefined，
 *   头像相关接口统一返回 503（见 lib/r2.ts）。
 * - APP_BASE_URL 等来自 wrangler.jsonc 的 vars
 * - JWT_SECRET 等来自 `wrangler secret put` 或本地 .dev.vars
 */
export interface Env {
  // ---- 绑定 ----
  DB: D1Database
  /** 可选：R2 未启用时不存在 */
  BUCKET?: R2Bucket

  // ---- 普通变量 ----
  APP_BASE_URL: string
  MAIL_FROM: string
  R2_BUCKET_NAME: string
  /** 逗号分隔的允许来源，例如 "http://localhost:5173,https://cf-demo.pages.dev" */
  ALLOWED_ORIGINS: string

  // ---- 密钥 ----
  JWT_SECRET: string
  /**
   * 注册口令（邀请码）。不配置则注册接口完全开放；配置后注册必须带上正确口令。
   * 见 lib/invite.ts。
   */
  REGISTER_CODE?: string
  /** 未配置时验证邮件降级为控制台输出 */
  RESEND_API_KEY?: string
  /** 以下三项未配置时头像上传降级为经 Worker 中转 */
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
}

/** 对外返回的用户信息，绝不包含 password_hash */
export interface PublicUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  emailVerified: boolean
  createdAt: number
}

export interface AppVariables {
  userId: string
}

export type AppEnv = {
  Bindings: Env
  Variables: AppVariables
}
