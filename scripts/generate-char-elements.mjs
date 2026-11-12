// 生成 src/lib/data/char-elements.generated.ts（角色名 → 属性，**仅服务端使用**）
//
// 用法：
//   node scripts/generate-char-elements.mjs          重新生成快照（游戏版本更新后跑一次）
//   node scripts/generate-char-elements.mjs --check  只比对快照是否落后于上游（不写文件，落后退出码 1）
//
// 数据源：https://static.nanoka.cc/ww/{version}/character.json
//
// 说明：
// - 页面实际用的是 `src/lib/data/char-elements-latest.ts`（6 小时缓存直连上游，失败才退回本快照），
//   所以快照落后**不会**让新角色缺失，只影响上游挂掉时的兜底质量；
// - 出问题排查时先跑 `--check`：能立刻看出快照是哪个版本、上游是哪个版本。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST = 'https://static.nanoka.cc/manifest.json'
const ELEMENT_BY_ID = ['', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭']
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/data/char-elements.generated.ts')
const CHECK_ONLY = process.argv.includes('--check')

const manifest = await fetch(MANIFEST).then((r) => r.json())
const version = manifest.ww?.latest ?? '3.6.1'
const url = `https://static.nanoka.cc/ww/${encodeURIComponent(version)}/character.json`
const data = await fetch(url).then((r) => r.json())

const map = {}
for (const c of Object.values(data)) {
    if (c.zh && c.element) map[c.zh] = ELEMENT_BY_ID[c.element] ?? ''
}

const lines = [
    '// 角色名 → 属性（由 scripts/generate-char-elements.mjs 生成，勿手改）',
    '// ⚠️ 仅服务端使用：客户端组件请勿 import 本文件（会把整张表打进客户端 bundle）。',
    '//    前端请改用 src/lib/data/char-elements.ts 的 charElement()/loadCharElements()。',
    `// 数据版本：${version}`,
    'export const CHAR_ELEMENTS: Record<string, string> = {',
    ...Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b, 'zh'))
        .map(([name, el]) => `    ${JSON.stringify(name)}: ${JSON.stringify(el)},`),
    '}',
    ''
]
const next = lines.join('\n')

if (CHECK_ONLY) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current.trim() === next.trim()) {
        console.log(`[ok] 静态快照与上游一致（${version}，${Object.keys(map).length} 个角色）`)
        process.exit(0)
    }
    const localVersion = /数据版本：(\S+)/.exec(current)?.[1] ?? '未知'
    console.error(
        `[stale] 静态快照是 ${localVersion}，上游已是 ${version}。` +
            '请运行 node scripts/generate-char-elements.mjs 重新生成（不影响线上，仅兜底数据落后）。'
    )
    process.exit(1)
}

writeFileSync(OUT, next)
console.log(`written ${Object.keys(map).length} entries -> ${OUT} (${version})`)
