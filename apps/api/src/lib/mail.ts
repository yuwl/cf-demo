import type { Env } from '../env'

export interface MailResult {
  sent: boolean
  detail: string
}

/**
 * 通过 Resend REST API 发信。
 *
 * 未配置 RESEND_API_KEY 时不报错，而是把邮件内容打印到控制台，
 * 这样在没有邮件服务的情况下整条注册流程依然能跑通（本地开发友好）。
 */
export async function sendMail(
  env: Env,
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<MailResult> {
  const apiKey = env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    console.log(
      [
        '[mail:fallback] 未配置 RESEND_API_KEY，邮件内容改为打印到控制台：',
        `  收件人: ${to}`,
        `  主题:   ${subject}`,
        '  ---- 正文 ----',
        text,
        '  --------------',
      ].join('\n'),
    )
    return { sent: false, detail: 'RESEND_API_KEY 未配置，已降级为控制台输出' }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`[mail:error] Resend 返回 ${response.status}: ${body}`)
    return { sent: false, detail: `Resend 返回 ${response.status}` }
  }

  return { sent: true, detail: 'ok' }
}

export function buildVerificationMail(displayName: string, link: string): {
  subject: string
  text: string
  html: string
} {
  const subject = '验证你的邮箱 · cf-demo 留言板'
  const text = [
    `你好 ${displayName}：`,
    '',
    '请打开下面的链接完成邮箱验证：',
    link,
    '',
    '链接 24 小时内有效。如果不是你本人操作，忽略本邮件即可。',
  ].join('\n')

  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1f2933">',
    `<p>你好 ${escapeHtml(displayName)}：</p>`,
    '<p>请点击下面的按钮完成邮箱验证：</p>',
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">验证邮箱</a></p>`,
    `<p style="color:#64748b;font-size:13px">按钮打不开就复制这个链接：<br>${link}</p>`,
    '<p style="color:#64748b;font-size:13px">链接 24 小时内有效。如果不是你本人操作，忽略本邮件即可。</p>',
    '</div>',
  ].join('')

  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
