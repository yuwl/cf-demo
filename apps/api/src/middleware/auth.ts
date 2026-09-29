import { HTTPException } from 'hono/http-exception'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../env'
import { verifyToken } from '../lib/jwt'

/**
 * 从 `Authorization: Bearer <jwt>` 解析并校验令牌。
 * 校验通过后把 userId 写入 context，供后续 handler 使用。
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HTTPException(401, { message: '缺少访问令牌' })
  }

  const userId = await verifyToken(token, c.env.JWT_SECRET)
  if (!userId) {
    throw new HTTPException(401, { message: '令牌无效或已过期，请重新登录' })
  }

  c.set('userId', userId)
  await next()
})
