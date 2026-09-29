/** 请求体字段校验。手写实现，避免为 demo 引入额外依赖。 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

interface StringRule {
  min: number
  max: number
}

export function requireString(value: unknown, label: string, rule: StringRule): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label}必须是字符串`)
  }
  const trimmed = value.trim()
  if (trimmed.length < rule.min) {
    throw new ValidationError(`${label}至少需要 ${rule.min} 个字符`)
  }
  if (trimmed.length > rule.max) {
    throw new ValidationError(`${label}最多 ${rule.max} 个字符`)
  }
  return trimmed
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function requireEmail(value: unknown): string {
  const email = requireString(value, '邮箱', { min: 3, max: 254 }).toLowerCase()
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError('邮箱格式不正确')
  }
  return email
}

/** 密码不做 trim —— 前后空格是用户密码的一部分 */
export function requirePassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('密码必须是字符串')
  }
  if (value.length < 8) {
    throw new ValidationError('密码至少需要 8 个字符')
  }
  if (value.length > 200) {
    throw new ValidationError('密码最多 200 个字符')
  }
  return value
}

/** 安全地读取 JSON body，解析失败返回 null 而不是抛异常 */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json()
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function parseLimit(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}
