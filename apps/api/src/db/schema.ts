import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  /** R2 中的对象 key，例如 avatars/<userId>/<uuid>.png */
  avatarKey: text('avatar_key'),
  emailVerified: integer('email_verified').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_messages_created_at').on(t.createdAt),
    index('idx_messages_user_id').on(t.userId),
  ],
)

export const emailTokens = sqliteTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    /** verify_email | reset_password */
    purpose: text('purpose').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_email_tokens_user_id').on(t.userId)],
)

/**
 * 通用键值配置表。
 *
 * 存在的理由：注册口令这种东西**不能进仓库**（本仓库是公开的），
 * 而放 `wrangler secret` 又**读不出来**（只能覆盖、不能查看）。
 * 放数据库里既能保密，又能随时用 `wrangler d1 execute` 查出来。
 *
 * 目前只用到 `register_code` 一个键。建表的迁移会进仓库，但**值不进仓库** ——
 * 值由部署时手工 insert 一次，见 README「注册口令」。
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export type UserRow = typeof users.$inferSelect
export type MessageRow = typeof messages.$inferSelect
export type EmailTokenRow = typeof emailTokens.$inferSelect
export type AppSettingRow = typeof appSettings.$inferSelect
