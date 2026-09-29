/**
 * 密码哈希：WebCrypto 原生 PBKDF2-SHA256。
 *
 * 为什么不用 bcrypt / argon2？
 * Workers 免费版单次请求只有 10ms CPU 额度，纯 JS 实现的 bcrypt 十万次迭代
 * 需要几百毫秒，会直接把额度打爆。PBKDF2 走 crypto.subtle，跑在 native 层，
 * 十万次迭代实测约 3-8ms，安全且不吃 JS CPU 时间。
 *
 * 存储格式：pbkdf2$<iterations>$<saltBase64>$<hashBase64>
 */

const ITERATIONS = 100_000
const KEY_BITS = 256
const SALT_BYTES = 16
const PREFIX = 'pbkdf2'

const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    baseKey,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/** 常数时间比较，避免通过响应时间泄露哈希前缀 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] as number) ^ (b[i] as number)
  }
  return diff === 0
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveBits(password, salt, ITERATIONS)
  return `${PREFIX}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== PREFIX) return false

  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations <= 0) return false

  try {
    const salt = base64ToBytes(parts[2] as string)
    const expected = base64ToBytes(parts[3] as string)
    const actual = await deriveBits(password, salt, iterations)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
