// 将存量 project_json 压缩为 project_blob（brotli）
// 用法：
//   $env:SUPABASE_ACCESS_TOKEN = "你的AccessToken"
//   node scripts/migrate-project-blob.mjs
// 可选：$env:SUPABASE_PROJECT_REF 覆盖项目（默认 sveaicbsvsbdkjmsalvd）
import { brotliCompressSync } from 'node:zlib'

const ref = process.env.SUPABASE_PROJECT_REF ?? 'sveaicbsvsbdkjmsalvd'
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
    console.error('缺少 SUPABASE_ACCESS_TOKEN（Supabase Dashboard → Account → Access Tokens 生成）')
    process.exit(1)
}

async function query(sql) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    })
    const text = await res.text()
    if (!res.ok) {
        console.error(`HTTP ${res.status}: ${text.slice(0, 500)}`)
        process.exit(1)
    }
    try {
        return JSON.parse(text)
    } catch {
        return []
    }
}

const rows = await query(
    'select id, project_json::text as raw from public.projects where project_blob is null'
)
console.log(`待压缩行数：${rows.length}`)

let updated = 0
for (const row of rows) {
    if (!row || !row.id || row.raw == null) continue
    const blob = brotliCompressSync(Buffer.from(row.raw, 'utf8'))
    const hex = '\\x' + blob.toString('hex')
    await query(
        `update public.projects set project_blob = '${hex}'::bytea where id = '${row.id}'`
    )
    updated++
    console.log(`[${updated}/${rows.length}] ${row.id}  ${(blob.length / 1024).toFixed(1)}KB`)
}

console.log(`完成：${updated}/${rows.length} 行已写入 project_blob`)
