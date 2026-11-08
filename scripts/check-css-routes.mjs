// 路由级 CSS 守卫：确保每个路由用到的 wk-* 类，其所属样式文件确实被该路由加载。
//
// 样式已拆分：
//   src/design/wk.css          → 由 globals.css 用 CSS @import 内联（全局）
//     （2026-XX 起不再从 layout.tsx 用 JS import：Turbopack dev 会把它并成共享 chunk，
//       热更新后偶发整块丢失，导致页面完全没样式；改成和 tailwind 同一条产物之后稳定。）
//   wk-plaza / wk-data / wk-me / wk-editor → 各路由自己 import
// 拆分最怕的是「某页用了类，但忘了 import 对应文件」——那是静默掉样式。
// 这个脚本遍历每个路由的 TSX 依赖图，算出它用到的 wk 类，再核对可用样式来源。
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, relative, basename, extname, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const DESIGN = join(SRC, 'design')

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full, out)
        else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(full.replace(/\\/g, '/'))
    }
    return out
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

function resolveSpec(spec, fromFile) {
    let base
    if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
    else return null
    for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.css`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
        if (existsSync(candidate) && /\.(tsx|ts|css)$/.test(candidate)) return resolve(candidate).replace(/\\/g, '/')
    }
    return null
}

/** 类 → 所属样式文件名 */
const cssFiles = (await readdir(DESIGN)).filter((n) => n.startsWith('wk') && n.endsWith('.css'))
const classOwner = new Map()
for (const name of cssFiles) {
    const raw = await readFile(join(DESIGN, name), 'utf8')
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of text.matchAll(/\.(wk-[a-z0-9-]+)/g)) {
        if (!classOwner.has(match[1])) classOwner.set(match[1], name)
    }
}

const allFiles = await walk(SRC)

async function graph(entry) {
    const seen = new Set()
    const stack = [entry]
    while (stack.length) {
        const file = stack.pop()
        if (seen.has(file)) continue
        seen.add(file)
        if (!/\.(tsx|ts)$/.test(file)) continue
        const text = await readFile(file, 'utf8')
        IMPORT_RE.lastIndex = 0
        let m
        while ((m = IMPORT_RE.exec(text)) !== null) {
            const target = resolveSpec(m[1], file)
            if (target && !seen.has(target)) stack.push(target)
        }
    }
    return seen
}

const usedClasses = (files) => {
    const used = new Map()
    for (const file of files) {
        if (!/\.(tsx|ts)$/.test(file)) continue
        const rel = relative(ROOT, file).split(sep).join('/')
        // 设计系统文件只定义组件，不代表本路由渲染了它们；用下面的组件映射代替
        if (rel.includes('src/design/')) continue
        const text = files.get ? '' : ''
        void text
    }
    return used
}
void usedClasses

// layout 的依赖图 = 全局可用（含 wk.css）
const layoutGraph = await graph(join(SRC, 'app', 'layout.tsx').replace(/\\/g, '/'))
const globalCss = new Set(['wk.css'])

const routePages = allFiles.filter((f) => f.startsWith(join(SRC, 'app').replace(/\\/g, '/')) && /\.(tsx|ts)$/.test(f) && /(page|loading|not-found)\.(tsx|ts)$/.test(f))

// 组件名 → 该组件依赖的「按路由加载」样式文件
// 类名字符串只存在于 design/ 里，所以这里按组件名判定
const COMPONENT_REQUIRES = [
    { re: /\bWk(Dialog|Confirm|Dropdown)\b/, css: 'wk-overlay.css' },
    { re: /\bWk(Rows|Row)\b/, css: 'wk-rows.css' },
    { re: /\bWk(ProjectCard)\b/, css: 'wk-plaza.css' },
    { re: /\bWk(SubstatEditor|SubstatSlotEditor)\b/, css: 'wk-editor.css' }
]

const problems = []
for (const page of routePages) {
    const pageGraph = await graph(page)
    const available = new Set(globalCss)
    // 本路由 import 的 css + layout 图里的 css
    for (const file of new Set([...pageGraph, ...layoutGraph])) {
        if (file.endsWith('.css')) available.add(basename(file))
    }
    // 组件级依赖：扫描本路由图里（非 design 自身）对这些组件的使用
    for (const file of pageGraph) {
        if (!/\.(tsx|ts)$/.test(file) || file.includes('/src/design/')) continue
        const text = await readFile(file, 'utf8')
        for (const rule of COMPONENT_REQUIRES) {
            if (rule.re.test(text) && !available.has(rule.css)) {
                problems.push({ route, cls: `${file.split('/').pop()} 渲染 ${rule.re.source}`, owner: rule.css })
            }
        }
    }

    // 用到的类（含 layout 图里的组件，因为它们在每个路由都渲染）
    const sources = new Set([...pageGraph, ...layoutGraph])
    for (const file of sources) {
        if (!/\.(tsx|ts)$/.test(file)) continue
        // 设计系统文件只定义组件（类名字符串在 barrel 里），不代表本路由渲染了它们
        if (file.includes('/src/design/')) continue
        const text = await readFile(file, 'utf8')
        for (const match of text.matchAll(/(?<![\w-])(wk-[a-z0-9-]+)/g)) {
            const cls = match[1]
            if (cls.endsWith('-')) continue
            const owner = classOwner.get(cls)
            if (!owner) continue // 不是样式类（可能是组件名/变量），跳过
            if (!available.has(owner)) {
                problems.push({ route: relative(ROOT, page).split(sep).join('/'), cls, owner })
            }
        }
    }
}

if (problems.length === 0) {
    console.log(`[PASS] ${routePages.length} 个路由的 CSS 依赖齐全`)
    process.exit(0)
}

const byRoute = new Map()
for (const p of problems) {
    if (!byRoute.has(p.route)) byRoute.set(p.route, new Set())
    byRoute.get(p.route).add(`${p.cls} → 需要 ${p.owner}`)
}
for (const [route, items] of byRoute) {
    console.log(`\n${route}`)
    for (const item of items) console.log('  ' + item)
}
console.log(`\n[FAIL] ${problems.length} 处缺失`)
process.exit(1)
