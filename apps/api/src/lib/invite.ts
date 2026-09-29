import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { getDb } from '../db/client'
import { appSettings } from '../db/schema'
import type { Env } from '../env'
import { ValidationError } from './validate'

/**
 * 注册口令（邀请码）校验。
 *
 * 目的：留言板是公开页面，注册接口默认谁都能调，容易被脚本批量灌垃圾账号。
 * 配了口令之后，注册必须带上正确的口令。
 *
 * 口令存哪里，是个有讲究的选择：
 * - 写进代码 / wrangler.jsonc → 本仓库是公开的，等于公开
 * - 放 wrangler secret → 保密，但**写进去就读不出来**，自己都查不到
 * - 放 D1 的 app_settings 表 → 既保密，又能随时 `wrangler d1 execute` 查
 *
 * 所以主存数据库。取值优先级：
 *   app_settings.register_code  >  环境变量 REGISTER_CODE  >  不设限
 * 环境变量那层只给本地开发和「迁移还没跑」兜底。
 */

const REGISTER_CODE_KEY = 'register_code'
const encoder = new TextEncoder()

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

/** 常数时间比较，避免通过响应时间泄露口令前缀 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number)
  }
  return diff === 0
}

async function readCodeFromDb(env: Env): Promise<string | null> {
  try {
    const db = getDb(env)
    const row = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, REGISTER_CODE_KEY))
      .get()
    const value = row?.value?.trim()
    return value ? value : null
  } catch (error) {
    // 迁移还没跑（表不存在）时别让注册接口直接 500，退回环境变量
    console.error('[invite] 读取注册口令失败，回退到环境变量', error)
    return null
  }
}

/** 当前生效的注册口令；返回 null 表示不设限 */
export async function resolveRegisterCode(env: Env): Promise<string | null> {
  const fromDb = await readCodeFromDb(env)
  if (fromDb) return fromDb
  const fromEnv = env.REGISTER_CODE?.trim()
  return fromEnv ? fromEnv : null
}

export async function registerCodeRequired(env: Env): Promise<boolean> {
  return (await resolveRegisterCode(env)) !== null
}

export async function assertRegisterCode(env: Env, provided: unknown): Promise<void> {
  const expected = await resolveRegisterCode(env)
  if (!expected) return

  if (typeof provided !== 'string' || provided.length === 0) {
    throw new ValidationError('需要填写注册口令')
  }

  const [actual, target] = await Promise.all([digest(provided), digest(expected)])
  if (!constantTimeEqual(actual, target)) {
    throw new HTTPException(403, { message: '注册口令不正确' })
  }
}
