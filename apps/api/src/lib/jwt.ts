import { SignJWT, jwtVerify } from 'jose'

const ALG = 'HS256'
/** 7 天 */
const TTL_SECONDS = 60 * 60 * 24 * 7

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secretKey(secret))
}

/** 校验通过返回 userId，否则返回 null（不抛异常，由调用方决定如何处理） */
export async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: [ALG] })
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
  } catch {
    return null
  }
}

export const TOKEN_TTL_SECONDS = TTL_SECONDS
