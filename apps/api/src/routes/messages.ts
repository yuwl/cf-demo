import { and, desc, eq, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/client'
import { messages, users } from '../db/schema'
import type { AppEnv } from '../env'
import { toPublicMessage } from '../lib/serialize'
import { parseLimit, readJson, requireString } from '../lib/validate'
import { requireAuth } from '../middleware/auth'

export const messageRoutes = new Hono<AppEnv>()

function encodeCursor(createdAt: number, id: string): string {
  return `${createdAt}:${id}`
}

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  const index = cursor.indexOf(':')
  if (index <= 0) return null
  const createdAt = Number(cursor.slice(0, index))
  const id = cursor.slice(index + 1)
  if (!Number.isFinite(createdAt) || id.length === 0) return null
  return { createdAt, id }
}

/** 留言列表：按时间倒序，游标分页（避免 offset 在数据变动时错位） */
messageRoutes.get('/', async (c) => {
  const limit = parseLimit(c.req.query('limit'), 20, 50)
  const cursor = c.req.query('cursor')
  const db = getDb(c.env)

  const filters = []
  if (cursor) {
    const parsed = decodeCursor(cursor)
    if (parsed) {
      filters.push(
        or(
          lt(messages.createdAt, parsed.createdAt),
          and(eq(messages.createdAt, parsed.createdAt), lt(messages.id, parsed.id)),
        ),
      )
    }
  }

  const rows = await db
    .select({ message: messages, author: users })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1)

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)

  return c.json({
    items: page.map((row) => toPublicMessage(row.message, row.author, new URL(c.req.url).origin)),
    nextCursor: hasMore && last ? encodeCursor(last.message.createdAt, last.message.id) : null,
  })
})

/** 发表留言 */
messageRoutes.post('/', requireAuth, async (c) => {
  const body = await readJson(c.req.raw)
  const content = requireString(body.content, '留言内容', { min: 1, max: 500 })
  const userId = c.get('userId')
  const db = getDb(c.env)

  const id = crypto.randomUUID()
  await db.insert(messages).values({
    id,
    userId,
    content,
    createdAt: Date.now(),
  })

  const created = await db.select().from(messages).where(eq(messages.id, id)).get()
  const author = await db.select().from(users).where(eq(users.id, userId)).get()

  if (!created || !author) {
    throw new HTTPException(500, { message: '留言写入后读取失败' })
  }

  return c.json(
    { message: toPublicMessage(created, author, new URL(c.req.url).origin) },
    201,
  )
})

/** 删除自己的留言 */
messageRoutes.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const db = getDb(c.env)

  const row = await db.select().from(messages).where(eq(messages.id, id)).get()
  if (!row) {
    throw new HTTPException(404, { message: '留言不存在' })
  }
  if (row.userId !== c.get('userId')) {
    throw new HTTPException(403, { message: '只能删除自己的留言' })
  }

  await db.delete(messages).where(eq(messages.id, id))
  return c.body(null, 204)
})
