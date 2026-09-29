import { and, eq, gt, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/client'
import { emailTokens, users } from '../db/schema'
import type { AppEnv } from '../env'
import { assertRegisterCode } from '../lib/invite'
import { signToken } from '../lib/jwt'
import { buildVerificationMail, sendMail } from '../lib/mail'
import { hashPassword, verifyPassword } from '../lib/password'
import { toPublicUser } from '../lib/serialize'
import {
  readJson,
  requireEmail,
  requirePassword,
  requireString,
  ValidationError,
} from '../lib/validate'
import { requireAuth } from '../middleware/auth'

export const authRoutes = new Hono<AppEnv>()

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000

function origin(c: { req: { url: string } }): string {
  return new URL(c.req.url).origin
}

/** 注册：建用户 + 发验证邮件，不自动登录（先验证邮箱更贴近真实流程） */
authRoutes.post('/register', async (c) => {
  const body = await readJson(c.req.raw)

  // 口令检查放在最前面：拦掉的请求不该再花 PBKDF2 十万次迭代的算力
  await assertRegisterCode(c.env, body.inviteCode)

  const email = requireEmail(body.email)
  const password = requirePassword(body.password)
  const displayName = requireString(body.displayName, '昵称', { min: 1, max: 40 })

  const db = getDb(c.env)

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get()

  if (existing) {
    throw new ValidationError('这个邮箱已经注册过了')
  }

  const now = Date.now()
  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    displayName,
    avatarKey: null,
    emailVerified: 0,
    createdAt: now,
  })

  // 生成邮箱验证令牌
  const token = crypto.randomUUID().replace(/-/g, '')
  await db.insert(emailTokens).values({
    id: crypto.randomUUID(),
    userId,
    token,
    purpose: 'verify_email',
    expiresAt: now + VERIFY_TTL_MS,
    usedAt: null,
    createdAt: now,
  })

  const link = `${c.env.APP_BASE_URL}/verify-email?token=${token}`
  const mail = buildVerificationMail(displayName, link)
  const mailResult = await sendMail(c.env, email, mail.subject, mail.text, mail.html)

  const created = await db.select().from(users).where(eq(users.id, userId)).get()
  if (!created) {
    throw new HTTPException(500, { message: '创建用户失败' })
  }

  return c.json(
    {
      user: toPublicUser(created, origin(c)),
      mailSent: mailResult.sent,
      mailDetail: mailResult.detail,
      // 仅在没有真实邮件通道时回传链接，方便本地 demo 直接点开验证
      devVerifyLink: mailResult.sent ? undefined : link,
    },
    201,
  )
})

/** 登录：邮箱 + 密码换 JWT */
authRoutes.post('/login', async (c) => {
  const body = await readJson(c.req.raw)
  const email = requireEmail(body.email)
  const password = requirePassword(body.password)

  const db = getDb(c.env)
  const row = await db.select().from(users).where(eq(users.email, email)).get()

  // 统一错误文案，避免暴露"该邮箱是否存在"
  const invalid = new HTTPException(401, { message: '邮箱或密码不正确' })
  if (!row) throw invalid

  const ok = await verifyPassword(password, row.passwordHash)
  if (!ok) throw invalid

  const token = await signToken(row.id, c.env.JWT_SECRET)
  return c.json({ token, user: toPublicUser(row, origin(c)) })
})

/** 当前登录用户 */
authRoutes.get('/me', requireAuth, async (c) => {
  const db = getDb(c.env)
  const row = await db.select().from(users).where(eq(users.id, c.get('userId'))).get()
  if (!row) {
    throw new HTTPException(401, { message: '账号不存在' })
  }
  return c.json({ user: toPublicUser(row, origin(c)) })
})

/** 消费邮箱验证令牌 */
authRoutes.post('/verify-email', async (c) => {
  const body = await readJson(c.req.raw)
  const token = requireString(body.token, '令牌', { min: 8, max: 128 })

  const db = getDb(c.env)
  const record = await db
    .select()
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.token, token),
        eq(emailTokens.purpose, 'verify_email'),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, Date.now()),
      ),
    )
    .get()

  if (!record) {
    throw new ValidationError('验证链接无效或已过期')
  }

  const now = Date.now()
  await db.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, record.id))
  await db.update(users).set({ emailVerified: 1 }).where(eq(users.id, record.userId))

  return c.json({ ok: true })
})
