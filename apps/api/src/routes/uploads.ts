import { AwsClient } from 'aws4fetch'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv, Env } from '../env'
import { getBucket } from '../lib/r2'
import { toPublicUser } from '../lib/serialize'
import { readJson, requireString, ValidationError } from '../lib/validate'
import { requireAuth } from '../middleware/auth'

export const uploadRoutes = new Hono<AppEnv>()

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const PRESIGN_TTL_SECONDS = 600

const ALLOWED_TYPES = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

function hasS3Credentials(env: Env): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)
}

function resolveExtension(contentType: string): string {
  const ext = ALLOWED_TYPES.get(contentType)
  if (!ext) {
    throw new ValidationError('只支持 PNG / JPEG / WebP / GIF 格式的图片')
  }
  return ext
}

function assertSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) {
    throw new ValidationError('文件大小无效')
  }
  if (size > MAX_AVATAR_BYTES) {
    throw new ValidationError('头像不能超过 2MB')
  }
}

/**
 * 第一步：申请上传目标。
 *
 * 配了 R2 的 S3 凭据 → 返回预签名 PUT URL，浏览器直传 R2，不经过 Worker。
 * 没配 S3 凭据 → 返回 mode=proxy，改由 /avatar/direct 中转，保证 demo 一定能跑通。
 * 连 R2 桶都没有 → 直接 503，别给前端一张传不上去的假 ticket。
 */
uploadRoutes.post('/avatar', requireAuth, async (c) => {
  getBucket(c.env)

  const body = await readJson(c.req.raw)
  const contentType = requireString(body.contentType, '文件类型', { min: 3, max: 64 }).toLowerCase()
  const size = Number(body.size)

  const ext = resolveExtension(contentType)
  assertSize(size)

  const userId = c.get('userId')
  const key = `avatars/${userId}/${crypto.randomUUID()}.${ext}`
  const selfOrigin = new URL(c.req.url).origin

  if (!hasS3Credentials(c.env)) {
    return c.json({
      mode: 'proxy' as const,
      key,
      uploadUrl: `${selfOrigin}/api/uploads/avatar/direct`,
      maxBytes: MAX_AVATAR_BYTES,
      note: '未配置 R2 S3 凭据，改由 Worker 中转上传',
    })
  }

  const client = new AwsClient({
    accessKeyId: c.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: c.env.R2_SECRET_ACCESS_KEY as string,
    service: 's3',
    region: 'auto',
  })

  const target = new URL(
    `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.env.R2_BUCKET_NAME}/${key}`,
  )
  target.searchParams.set('X-Amz-Expires', String(PRESIGN_TTL_SECONDS))

  const signed = await client.sign(new Request(target, { method: 'PUT' }), {
    aws: { signQuery: true },
  })

  return c.json({
    mode: 'presigned' as const,
    key,
    uploadUrl: signed.url,
    maxBytes: MAX_AVATAR_BYTES,
    expiresIn: PRESIGN_TTL_SECONDS,
    note: '浏览器可直接 PUT 到 R2，不经过 Worker',
  })
})

/** 降级路径：经 Worker 中转写入 R2（仅在未配置 S3 凭据时被前端调用） */
uploadRoutes.post('/avatar/direct', requireAuth, async (c) => {
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    throw new ValidationError('缺少 file 字段')
  }
  assertSize(file.size)
  const ext = resolveExtension(file.type.toLowerCase())

  const userId = c.get('userId')
  const key = `avatars/${userId}/${crypto.randomUUID()}.${ext}`

  await getBucket(c.env).put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  return c.json({ key })
})

/** 第二步：上传成功后确认，把 key 落到用户记录并清掉旧头像 */
uploadRoutes.post('/avatar/confirm', requireAuth, async (c) => {
  const body = await readJson(c.req.raw)
  const key = requireString(body.key, '对象 key', { min: 1, max: 256 })
  const userId = c.get('userId')

  // 关键的安全校验：不允许把别人的对象挂到自己头上
  if (!key.startsWith(`avatars/${userId}/`)) {
    throw new HTTPException(403, { message: '这个对象不属于当前用户' })
  }

  const head = await getBucket(c.env).head(key)
  if (!head) {
    throw new ValidationError('文件还没有上传成功，请重试')
  }

  const db = getDb(c.env)
  const previous = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .get()

  await db.update(users).set({ avatarKey: key }).where(eq(users.id, userId))

  if (previous?.avatarKey && previous.avatarKey !== key) {
    await getBucket(c.env).delete(previous.avatarKey).catch(() => undefined)
  }

  const row = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!row) {
    throw new HTTPException(401, { message: '账号不存在' })
  }

  return c.json({ user: toPublicUser(row, new URL(c.req.url).origin) })
})
