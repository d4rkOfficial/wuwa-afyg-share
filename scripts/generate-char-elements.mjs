// 生成 src/lib/data/char-elements.ts（角色名 → 属性）
// 用法：node scripts/generate-char-elements.mjs
// 数据源：https://static.nanoka.cc/ww/{version}/character.json

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST = 'https://static.nanoka.cc/manifest.json'
const ELEMENT_BY_ID = ['', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭']
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/data/char-elements.ts')

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
    `// 数据版本：${version}`,
    'export const CHAR_ELEMENTS: Record<string, string> = {',
    ...Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b, 'zh'))
        .map(([name, el]) => `    ${JSON.stringify(name)}: ${JSON.stringify(el)},`),
    '}',
    '',
    'export function charElement(name: string): string {',
    "    return CHAR_ELEMENTS[name] ?? ''",
    '}',
    ''
]

writeFileSync(OUT, lines.join('\n'))
console.log(`written ${Object.keys(map).length} entries -> ${OUT} (${version})`)
