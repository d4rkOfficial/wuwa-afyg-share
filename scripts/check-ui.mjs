#!/usr/bin/env node
/**
 * 设计系统 v2 校验（docs/ui-spec-v2.md 六条硬规则的可执行版本）
 *
 * 默认只检查「已迁移文件」——即 src/design/ 下的文件、以及任何 import 了 @/design 的文件。
 * 这样一个文件迁到新系统后才开始受约束，不会因为历史代码一次性爆红。
 *
 *   node scripts/check-ui.mjs              # 只查已迁移文件（CI 用这个）
 *   node scripts/check-ui.mjs --all        # 全仓库体检（迁移前的基线，会大量报错）
 *   node scripts/check-ui.mjs --list       # 只列出已迁移文件
 *
 * 单行豁免：在该行任意位置写 `wk-allow` + 原因。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const ALLOW_MARK = 'wk-allow'

const flags = new Set(process.argv.slice(2))
const SCAN_ALL = flags.has('--all')
const LIST_ONLY = flags.has('--list')

// ── 白名单 ────────────────────────────────────────────────────────────────
/** H1 字号六档 */
const ALLOWED_FONT_PX = new Set([12, 14, 16, 20, 26, 34])
/** H2 控件高度两档（Tailwind 里对应 8 = 32、9 = 36） */
const ALLOWED_CTRL_H = new Set([8, 9])

// ── 规则 ──────────────────────────────────────────────────────────────────
const RULES = [
    {
        id: 'H1-字号',
        re: /text-\[(\d+(?:\.\d+)?)px\]/g,
        message: (m) => `字号 ${m[1]}px 不在六档内（12/14/16/20/26/34）`,
        validate: (m) => !ALLOWED_FONT_PX.has(Number(m[1]))
    },
    {
        id: 'H2-控件高度',
        re: /\b(?:h|size|min-h)-(\d+)\b/g,
        message: (m) => `高度 ${m[1]}（${Number(m[1]) * 4}px）不是控件两档（h-8=32 / h-9=36）`,
        validate: (m) => Number(m[1]) >= 7 && Number(m[1]) <= 14 && !ALLOWED_CTRL_H.has(Number(m[1])),
        only: (line) => /(?:^|[\s"'`])(?:h|size|min-h)-\d+/g.test(line) && /className|class=/.test(line)
    },
    {
        id: 'H3-圆角',
        re: /\brounded-(?:full|3xl|2xl|xl|lg|md|none)\b/g,
        message: () => '圆角只有两档：rounded-[4px] / rounded-[8px]（头像与开关除外，请用 .wk 里的类）',
        validate: () => true
    },
    {
        id: 'H3-半格间距',
        re: /\b(?:m[trblxy]?|p[trblxy]?|gap[xy]?|space[xy]|inset[xy]?)-(?:0\.5|1\.5|2\.5|3\.5)\b/g,
        message: (m) => `间距 ${m[0]} 不在七档网格内（4/8/12/16/24/32/48）`,
        validate: () => true
    },
    {
        id: 'H5-旧令牌',
        re: /\(--(?:card-border|card-hover|card|btn-bg|btn-text|muted|fg|accent-text|accent-fg|accent|danger|success|warning|info|input-bg|code-bg|code-bg-strong|overlay)\)/g,
        message: (m) => `引用了旧设计系统令牌 ${m[0]}，新代码请用 --wk-* 或组件`,
        validate: () => true
    },
    {
        id: 'H5-旧类名',
        re: /(?<![\w-])(mg-(?:card|title|title-xl|section|hairline|num|note)|ui-(?:btn|input|card|field|seg|badge|dialog|menu|table|empty|skeleton|page-head|page-title|page-sub)|toolbar-btn(?:-[a-z]+)?|fx-[a-z-]+|tui-[a-z-]+)(?![\w-])/g,
        message: (m) => `使用了旧设计系统的类 ${m[0]}`,
        validate: () => true
    },
    {
        id: 'H3-焦点',
        re: /\boutline-none\b/g,
        message: () => '出现了 outline-none：焦点可见性由 .wk 里的 :focus-visible 统一提供，不要再局部关掉',
        validate: () => true
    }
]

// ── 文件收集 ──────────────────────────────────────────────────────────────
async function walk(dir) {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...(await walk(full)))
        else if (/\.(?:tsx|jsx)$/.test(entry.name)) out.push(full)
    }
    return out
}

const ALLOWLIST = new Set(
    (await readFile(join(ROOT, 'scripts', 'legacy-allowlist.txt'), 'utf8'))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
)
let skippedLegacy = 0
const files = await walk(SRC)

const scanned = []
for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/')
    const text = await readFile(file, 'utf8')
    const isDesign = rel.startsWith('src/design/') || rel.startsWith('src/app/dev/')
    const importsDesign = /from\s+['"]@\/design['"]/.test(text)
    if (ALLOWLIST.has(rel)) { skippedLegacy += 1; continue }
    if (SCAN_ALL || isDesign || importsDesign) scanned.push({ rel, text })
}

if (LIST_ONLY) {
    for (const { rel } of scanned) console.log(rel)
    console.log(`\n共 ${scanned.length} 个文件在检查范围内`)
    process.exit(0)
}

// ── 检查 ──────────────────────────────────────────────────────────────────
let violations = 0
const byRule = new Map()

for (const { rel, text } of scanned) {
    const lines = text.split(/\r?\n/)
    const fileHits = []

    lines.forEach((line, index) => {
        if (line.includes(ALLOW_MARK)) return
        for (const rule of RULES) {
            if (rule.only && !rule.only(line)) continue
            rule.re.lastIndex = 0
            let match
            while ((match = rule.re.exec(line)) !== null) {
                if (!rule.validate(match)) continue
                fileHits.push({ rule: rule.id, message: rule.message(match), line: index + 1 })
                byRule.set(rule.id, (byRule.get(rule.id) ?? 0) + 1)
            }
        }
    })

    if (fileHits.length > 0) {
        violations += fileHits.length
        console.log(`\n${rel}`)
        for (const hit of fileHits) {
            console.log(`  ${String(hit.line).padStart(4)}  [${hit.rule}] ${hit.message}`)
        }
    }
}

// ── 附加检查：TSX 里用到的 wk-* 类必须在 wk.css 里有定义 ──────────────────
// （沙箱里跑不起 dev server，用这条静态不变量替代样式覆盖度的运行期验证）
// 样式已按路由拆分：核心 wk.css + wk-plaza/wk-data/wk-me/wk-editor.css
const designDir = join(SRC, 'design')
const cssFiles = (await readdir(designDir)).filter((name) => name.startsWith('wk') && name.endsWith('.css'))
let cssText = ''
for (const name of cssFiles) cssText += (await readFile(join(designDir, name), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
const definedClasses = new Set(
    (cssText.match(/\.wk-[a-z0-9-]+/g) ?? []).map((token) => token.slice(1))
)

/** 只从 className / cn(...) 里取类名，避免把 style 里的 --wk-* 变量当成类 */
function collectUsedClasses(text) {
    const used = new Set()
    const sources = []
    for (const match of text.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\n\s*\})/g)) {
        sources.push(match[1] ?? match[2] ?? match[3] ?? '')
    }
    for (const match of text.matchAll(/\bcn\(([\s\S]*?)\)/g)) {
        sources.push(match[1])
    }
    for (const source of sources) {
        for (const token of source.match(/(?<![\w-])wk-[a-z0-9-]+/g) ?? []) {
            used.add(token)
        }
    }
    return used
}

const unknownClassHits = []
for (const { rel, text } of scanned) {
    if (rel.startsWith('src/design/')) continue
    for (const token of collectUsedClasses(text)) {
        if (!definedClasses.has(token)) unknownClassHits.push({ rel, token })
    }
}
if (unknownClassHits.length > 0) {
    violations += unknownClassHits.length
    console.log('\n未定义的 wk-* 类（TSX 用了但 wk.css 没有）：')
    for (const hit of unknownClassHits) console.log(`  ${hit.rel}  ${hit.token}`)
    byRule.set('CSS-覆盖', (byRule.get('CSS-覆盖') ?? 0) + unknownClassHits.length)
}

// ── 全仓库基线（信息性，不计入失败） ──────────────────────────────────────
const baseline = { 'text-[10px]': 0, 'text-[11px]': 0, '半格间距': 0, 'rounded-full': 0, '旧类名': 0 }
for (const file of files) {
    const text = await readFile(file, 'utf8')
    baseline['text-[10px]'] += (text.match(/text-\[10px\]/g) ?? []).length
    baseline['text-[11px]'] += (text.match(/text-\[11px\]/g) ?? []).length
    baseline['半格间距'] += (text.match(/\b(?:m[trblxy]?|p[trblxy]?|gap[xy]?|space[xy])-(?:0\.5|1\.5|2\.5|3\.5)\b/g) ?? []).length
    baseline['rounded-full'] += (text.match(/\brounded-full\b/g) ?? []).length
    baseline['旧类名'] += (text.match(/(?<![\w-])(?:mg-[a-z-]+|ui-(?:btn|input|card)|toolbar-btn|fx-[a-z-]+)(?![\w-])/g) ?? []).length
}

console.log('\n── 汇总 ──────────────────────────────────────')
console.log(`检查范围：${scanned.length} 个文件${SCAN_ALL ? '（全仓库）' : '（仅已迁移文件）'}`)
if (violations === 0) {
    console.log('[PASS] 无违规')
} else {
    console.log(`[FAIL] ${violations} 处违规`)
    for (const [rule, count] of byRule) console.log(`   ${rule}: ${count}`)
}
console.log('\n全仓库基线（迁移进度参考，不参与判定）：')
for (const [name, count] of Object.entries(baseline)) console.log(`   ${name.padEnd(12)} ${count}`)

process.exit(violations === 0 ? 0 : 1)
