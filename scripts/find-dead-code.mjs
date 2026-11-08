// 从路由入口做可达性遍历，找出 src 下不可达的文件（死文件孤岛）
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, relative, basename, extname, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const ENTRY_NAMES = new Set([
    'page',
    'layout',
    'route',
    'loading',
    'not-found',
    'error',
    'global-error',
    'template',
    'default',
    'middleware',
    'instrumentation'
])

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full, out)
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g

function resolveSpec(spec, fromFile) {
    let base
    if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
    else return null
    const candidates = [
        base,
        `${base}.tsx`,
        `${base}.ts`,
        join(base, 'index.tsx'),
        join(base, 'index.ts')
    ]
    for (const candidate of candidates) {
        if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate
    }
    return null
}

const all = await walk(SRC)
const entries = all.filter((file) => ENTRY_NAMES.has(basename(file, extname(file))))

const reachable = new Set()
const queue = [...entries]

while (queue.length) {
    const file = queue.pop()
    const normalized = resolve(file)
    if (reachable.has(normalized)) continue
    reachable.add(normalized)
    let text
    try {
        text = await readFile(file, 'utf8')
    } catch {
        continue
    }
    IMPORT_RE.lastIndex = 0
    let match
    while ((match = IMPORT_RE.exec(text)) !== null) {
        const target = resolveSpec(match[1], file)
        if (target && !reachable.has(resolve(target))) queue.push(target)
    }
}

const dead = all.filter((file) => !reachable.has(resolve(file)))

console.log(`入口文件：${entries.length}`)
console.log(`可达文件：${reachable.size}`)
console.log(`不可达文件：${dead.length}`)
for (const file of dead.sort()) {
    console.log('  ' + relative(ROOT, file).split(sep).join('/'))
}
