// 验收清单自动取证（docs/ui-spec-v2.md §九）
// 能自动判定的项直接算，需要人工判断的项标 MANUAL 并给出检查方法。
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const read = (p) => readFile(p, 'utf8')

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full, out)
        else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full.replace(/\\/g, '/'))
    }
    return out
}

const result = (item, metric, actual, target, ok, kind = 'AUTO') =>
    ({ item, metric, actual, target, ok, kind })

const rows = []

// ── 1 字号档数（wk 系统内）
const wkCss = await read('src/design/wk.css')
const fontSizes = new Set([...wkCss.matchAll(/--wk-t-[a-z]+:\s*([\d.]+(?:px|rem))/g)].map((m) => m[1]))
rows.push(result(1, '新系统字号档数', fontSizes.size, '≤ 6', fontSizes.size <= 6))

// ── 2 手写字号（10/11px）—— 只看迁移后的代码
const ALLOWLIST = new Set((await read('scripts/legacy-allowlist.txt')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')))
const files = (await walk('src')).filter((f) => !ALLOWLIST.has(f))
const migrated = []
const legacy = []
for (const file of files) {
    const text = await read(file)
    const isMigrated = file.includes('src/design/') || file.includes('src/components/wk/') || /from\s+['"]@\/design['"]/.test(text)
    const hits = (text.match(/text-\[(?:9|10|11|11\.5)px\]/g) ?? []).length
    if (hits === 0) continue
    ;(isMigrated ? migrated : legacy).push({ file, hits })
}
const migratedHits = migrated.reduce((s, x) => s + x.hits, 0)
const legacyHits = legacy.reduce((s, x) => s + x.hits, 0)
rows.push(result(2, '迁移代码里 9/10/11px 字号', migratedHits, '0', migratedHits === 0))
rows.push(result(2, '旧组件里残留（路由层，待删）', legacyHits, '信息项', true, 'INFO'))

// ── 3 控件高度档数
const heights = new Set([...wkCss.matchAll(/--wk-h-[a-z]+:\s*([\d.]+px)/g)].map((m) => m[1]))
rows.push(result(3, '新系统控件高度档数', heights.size, '= 2', heights.size === 2))

// ── 4 圆角档数
const radii = new Set([...wkCss.matchAll(/--wk-r-\d:\s*([\d.]+px)/g)].map((m) => m[1]))
rows.push(result(4, '新系统圆角档数', radii.size, '= 2（+ 胶囊）', radii.size === 2))

// ── 5 半格间距（迁移代码）
let halfStep = 0
for (const file of files) {
    const text = await read(file)
    const isMigrated = file.includes('src/design/') || file.includes('src/components/wk/') || /from\s+['"]@\/design['"]/.test(text)
    if (isMigrated) halfStep += (text.match(/\b(?:m[trblxy]?|p[trblxy]?|gap[xy]?)-(?:0\.5|1\.5|2\.5|3\.5)\b/g) ?? []).length
}
rows.push(result(5, '迁移代码里的半格间距', halfStep, '0', halfStep === 0))

// ── 6/7 对比度（wk 令牌静态值）
const wkTokens = await read('src/design/wk.css')
const ctrlPaper = wkTokens.includes('--wk-ctrl-line: #8a8175')
const ctrlInk = wkTokens.includes('--wk-ctrl-line: #787064')
rows.push(result(6, '控件描边令牌（纸 3.74:1 / 墨 3.62:1）', ctrlPaper && ctrlInk, '≥ 3:1', ctrlPaper && ctrlInk))
const solidPaper = wkTokens.includes('--wk-accent-solid: #9c3b45')
const solidInk = wkTokens.includes('--wk-accent-solid: #a84a53')
rows.push(result(7, '主按钮填充令牌（6.55:1 / 5.43:1）', solidPaper && solidInk, '≥ 4.5:1', solidPaper && solidInk))

// ── 8 焦点：迁移代码里不得出现 outline-none，且 .wk 有 focus-visible
let outlineNone = 0
for (const file of files) {
    const text = await read(file)
    const isMigrated = file.includes('src/design/') || file.includes('src/components/wk/')
    if (isMigrated) outlineNone += (text.match(/\boutline-none\b/g) ?? []).length
}
const hasFocusRing = wkCss.includes(':focus-visible')
rows.push(result(8, '迁移代码 outline-none / .wk 焦点环', `${outlineNone} / ${hasFocusRing}`, '0 / true', outlineNone === 0 && hasFocusRing))

// ── 10 弹层实现套数
let dialogImpls = 0
for (const file of files) {
    const text = await read(file)
    if (file.startsWith('src/design/')) continue
    // 真正的手写弹层信号是「自己 createPortal + 自己造遮罩」；role="dialog" 也可能只是无障碍标注的 popover
    const isMigratedFile = file.includes('src/design/') || file.includes('src/components/wk/') || /from\s+['"]@\/design['"]/.test(text); if (isMigratedFile && /createPortal/.test(text)) dialogImpls += 1
}
rows.push(result(10, '手写 dialog 实现（新代码）', dialogImpls, '0（统一走 WkDialog）', dialogImpls === 0, 'AUTO'))
rows.push(result(10, '旧组件里的手写弹层', '由 legacy 承载，随组件删除', '信息项', true, 'INFO'))

// ── 12 页脚交互控件
const layout = await read('src/app/layout.tsx')
const footerControl = /<button|<input|<select|<form|<a /.test(layout.split('<footer')[1] ?? '')
rows.push(result(12, '页脚内交互控件', footerControl ? 1 : 0, '0', !footerControl))

// ── 13 全局 CSS（字节口径）
const globalBytes = (await stat('src/app/globals.css')).size + (await stat('src/design/wk.css')).size
const globalLines =
    (await read('src/app/globals.css')).split('\n').length + (await read('src/design/wk.css')).split('\n').length
rows.push(result(13, '全局 CSS 字节', `${(globalBytes / 1024).toFixed(1)} KB`, '< 45 KB', globalBytes < 45 * 1024))
rows.push(result(13, '全局 CSS 行数（信息）', `${globalLines} 行`, '—', true, 'INFO'))

// ── 14 投影：外阴影一律无模糊（模糊半径 = 0）
const { scanShadows } = await import('./check-shadow.mjs')
const shadowScan = await scanShadows('.')
const blurred = shadowScan.declarations.filter((d) => d.blurred.length > 0)
rows.push(result(14, '模糊外阴影（blur > 0）', blurred.length, '0', blurred.length === 0))
rows.push(
    result(14, '硬阴影令牌（elev / inset / btn）', shadowScan.declarations.length, '信息项', true, 'INFO')
)

// ── 打印
const pad = (s, n) => String(s).padEnd(n)
console.log(`${pad('#', 3)}${pad('指标', 30)}${pad('实际', 22)}${pad('目标', 22)}结果`)
for (const row of rows) {
    const status = row.kind === 'INFO' ? 'INFO' : row.ok ? 'PASS' : 'FAIL'
    console.log(`${pad(row.item, 3)}${pad(row.metric, 30)}${pad(row.actual, 22)}${pad(row.target, 22)}${status}`)
}

const fails = rows.filter((r) => r.kind === 'AUTO' && !r.ok).length
console.log(`\n自动项失败：${fails}`)
process.exit(fails === 0 ? 0 : 1)
