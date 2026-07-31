// 配置椰果工坊 Supabase 自定义 SMTP（Resend）并调高邮件限流
// 用法：
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
//   $env:RESEND_API_KEY = "re_..."
//   node scripts/configure-smtp.mjs
// 可选覆盖：
//   $env:SMTP_SENDER = "noreply@mail.200503.xyz"
//   $env:SMTP_SENDER_NAME = "椰果工坊"
//   $env:RATE_LIMIT_EMAIL_SENT = "120"
//   $env:SUPABASE_PROJECT_REF = "sveaicbsvsbdkjmsalvd"
import process from 'node:process'

const ref = process.env.SUPABASE_PROJECT_REF ?? 'sveaicbsvsbdkjmsalvd'
const token = process.env.SUPABASE_ACCESS_TOKEN
const resendKey = process.env.RESEND_API_KEY
if (!token) {
    console.error('缺少 SUPABASE_ACCESS_TOKEN（Supabase Dashboard → Account → Access Tokens 生成）')
    process.exit(1)
}
if (!resendKey) {
    console.error('缺少 RESEND_API_KEY（Resend Dashboard → API Keys 生成）')
    process.exit(1)
}

const sender = process.env.SMTP_SENDER ?? 'noreply@mail.200503.xyz'
const senderName = process.env.SMTP_SENDER_NAME ?? '椰果工坊'
const rateLimit = Number(process.env.RATE_LIMIT_EMAIL_SENT ?? 120)

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
    console.error(`发件地址不合法：${sender}`)
    process.exit(1)
}

const body = {
    smtp_host: 'smtp.resend.com',
    smtp_port: '587',
    smtp_user: 'resend',
    smtp_pass: resendKey,
    smtp_admin_email: sender,
    smtp_sender_name: senderName,
    rate_limit_email_sent: rateLimit
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
})
const text = await res.text()
console.log(`HTTP ${res.status}`)
if (!res.ok) {
    console.error(text.slice(0, 500))
    process.exit(1)
}

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` }
}).then((x) => x.json())

console.log(`smtp_host=${r.smtp_host}:${r.smtp_port}`)
console.log(`smtp_user=${r.smtp_user} pass_set=${Boolean(r.smtp_pass)}`)
console.log(`sender=${r.smtp_admin_email} name=${r.smtp_sender_name}`)
console.log(`rate_limit_email_sent=${r.rate_limit_email_sent}`)
console.log('SMTP 配置已应用（约几分钟内传播生效）')
