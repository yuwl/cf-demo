import { HTTPException } from 'hono/http-exception'
import type { Env } from '../env'

/**
 * R2 是可选能力。
 *
 * Cloudflare 的 R2 必须先绑定支付方式才能启用（免费额度内不扣费），
 * 所以 wrangler.jsonc 里的 r2_buckets 绑定是被注释掉的 —— 未启用时
 * env.BUCKET 就是 undefined。
 *
 * 这里把「有没有桶」的判断收口，避免每个调用点各写一遍 if，
 * 也保证降级时返回的是一句人能看懂的 503，而不是 TypeError。
 */

export function hasBucket(env: Env): boolean {
  return Boolean(env.BUCKET)
}

export function getBucket(env: Env): R2Bucket {
  if (!env.BUCKET) {
    throw new HTTPException(503, {
      message: '头像功能未启用：当前部署没有绑定 R2 存储桶',
    })
  }
  return env.BUCKET
}
