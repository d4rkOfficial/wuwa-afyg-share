// 生成 src/lib/data/char-elements.generated.ts（角色名 → 属性，**仅服务端使用**）
// 用法：node scripts/generate-char-elements.mjs
// 数据源：https://static.nanoka.cc/ww/{version}/character.json
//
// 注意：本脚本只生成「静态数据集」，绝不生成/覆盖客户端取数模块（src/lib/data/char-elements.ts）。
// 客户端模块只负责 fetch /api/char-elements + localStorage 缓存，不含任何静态数据，
// 以免同一份数据既进 bundle 又进缓存（两份冗余）。

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST = 'https://static.nanoka.cc/manifest.json'
const ELEMENT_BY_ID = ['', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭']
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/data/char-elements.generated.ts')

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

writeFileSync(OUT, lines.join('\n'))
console.log(`written ${Object.keys(map).length} entries -> ${OUT} (${version})`)
