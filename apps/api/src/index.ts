import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './env'
import { registerCodeRequired } from './lib/invite'
import { hasBucket } from './lib/r2'
import { ValidationError } from './lib/validate'
import { authRoutes } from './routes/auth'
import { avatarRoutes } from './routes/avatars'
import { messageRoutes } from './routes/messages'
import { uploadRoutes } from './routes/uploads'

const app = new Hono<AppEnv>()

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/**
 * 前后端分离部署 → 前端在 Pages 域名、后端在 workers.dev 域名，
 * 所以必须显式放行跨域来源。用 ALLOWED_ORIGINS 白名单而不是 `*`，
 * 因为将来若改用 Cookie 认证，`*` 会直接失效。
 */
app.use(
  '/api/*',
  cors({
    origin: (requestOrigin, c) => {
      const allowed = parseAllowedOrigins(c.env.ALLOWED_ORIGINS)
      if (requestOrigin && allowed.includes(requestOrigin)) {
        return requestOrigin
      }
      return null
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
)

/**
 * 健康检查顺带暴露能力开关，前端据此决定「换头像」按钮显不显示、注册要不要填口令。
 * 与其让用户点一下再吃一个 503/403，不如一开始就不给这个入口。
 *
 * 注意：registerCodeRequired 要读一次 D1（app_settings 主键查，很轻），
 * 前端每次进页面都会调这个接口，量级完全够用。
 */
app.get('/api/health', async (c) =>
  c.json({
    ok: true,
    service: 'cf-demo-api',
    ts: Date.now(),
    features: {
      avatarUpload: hasBucket(c.env),
      mail: Boolean(c.env.RESEND_API_KEY),
      registerCodeRequired: await registerCodeRequired(c.env),
    },
  }),
)

app.route('/api/auth', authRoutes)
app.route('/api/messages', messageRoutes)
app.route('/api/uploads', uploadRoutes)
app.route('/api/avatars', avatarRoutes)

app.notFound((c) => c.json({ error: '接口不存在' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message || '请求失败' }, err.status)
  }
  if (err instanceof ValidationError) {
    return c.json({ error: err.message }, 400)
  }
  console.error('[unhandled-error]', err)
  return c.json({ error: '服务器内部错误' }, 500)
})

export default app
