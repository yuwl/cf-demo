import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { getBucket } from '../lib/r2'

export const avatarRoutes = new Hono<AppEnv>()

/**
 * 从 R2 读出头像并回给浏览器。
 *
 * 这样不需要给 R2 bucket 配公开域名或 r2.dev 访问，
 * 代价是每次读头像会消耗一次 Worker 请求额度（demo 完全够用）。
 *
 * 注意：R2 未启用时 users.avatar_key 恒为 null，前端也不会拼出这个 URL，
 * 所以正常情况下根本走不到这里；真走到了说明绑定配置有问题，用 getBucket 明确报错。
 */
avatarRoutes.get('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const db = getDb(c.env)

  const row = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  if (!row?.avatarKey) {
    throw new HTTPException(404, { message: '该用户没有头像' })
  }

  const object = await getBucket(c.env).get(row.avatarKey)
  if (!object) {
    throw new HTTPException(404, { message: '头像文件不存在' })
  }

  const headers = new Headers()
  headers.set('content-type', object.httpMetadata?.contentType ?? 'application/octet-stream')
  headers.set('cache-control', 'public, max-age=300')
  headers.set('etag', object.httpEtag)

  return new Response(object.body, { headers })
})
