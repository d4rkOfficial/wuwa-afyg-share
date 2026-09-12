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
    "const CHAR_ELEMENTS_CACHE_KEY = 'wuwa-afyg:char-elements'",
    'let latestElementsPromise: Promise<Record<string, string>> | null = null',
    '',
    'async function getLatestElements(): Promise<Record<string, string>> {',
    '    if (typeof window === \'undefined\') return CHAR_ELEMENTS',
    '    if (latestElementsPromise) return latestElementsPromise',
    '',
    '    latestElementsPromise = fetch(\'/api/char-elements\', { cache: \'no-store\' })',
    '        .then((response) => {',
    "            if (!response.ok) throw new Error('角色数据获取失败')",
    '            return response.json() as Promise<{ elements?: unknown }>',
    '        })',
    '        .then((data) => {',
    "            if (!data.elements || typeof data.elements !== 'object') throw new Error('角色数据格式错误')",
    '            const elements = data.elements as Record<string, string>',
    '            try { localStorage.setItem(CHAR_ELEMENTS_CACHE_KEY, JSON.stringify({ elements })) } catch {}',
    '            return elements',
    '        })',
    '        .catch(() => {',
    '            try {',
    '                const cached = JSON.parse(localStorage.getItem(CHAR_ELEMENTS_CACHE_KEY) ?? \"\") as { elements?: unknown }',
    "                if (cached.elements && typeof cached.elements === 'object') return cached.elements as Record<string, string>",
    '            } catch {}',
    '            return CHAR_ELEMENTS',
    '        })',
    '    return latestElementsPromise',
    '}',
    '',
    'export async function charElement(name: string): Promise<string> {',
    '    const elements = await getLatestElements()',
    "    return elements[name] ?? ''",
    '}',
    ''
]

writeFileSync(OUT, lines.join('\n'))
console.log(`written ${Object.keys(map).length} entries -> ${OUT} (${version})`)
