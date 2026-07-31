// 应用「椰果工坊」Magic Link 邮件模板到 Supabase Auth
// 用法：
//   $env:SUPABASE_ACCESS_TOKEN = "你的AccessToken"
//   node scripts/apply-auth-emails.mjs
// 可选：$env:SUPABASE_PROJECT_REF 覆盖项目（默认 sveaicbsvsbdkjmsalvd）
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ref = process.env.SUPABASE_PROJECT_REF ?? 'sveaicbsvsbdkjmsalvd'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
    console.error('缺少 SUPABASE_ACCESS_TOKEN（Supabase Dashboard → Account → Access Tokens 生成）')
    process.exit(1)
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'email-templates')
const html = await readFile(path.join(dir, 'magic-link.html'), 'utf8')
const subject = '{{ .Token }} 是您的椰果工坊登录验证码'

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        mailer_subjects_magic_link: subject,
        mailer_templates_magic_link_content: html
    })
})

const text = await res.text()
console.log(`HTTP ${res.status}`)
if (!res.ok) {
    console.error(text.slice(0, 500))
    process.exit(1)
}
console.log('已应用 Magic Link 邮件模板（主题 + HTML）')
