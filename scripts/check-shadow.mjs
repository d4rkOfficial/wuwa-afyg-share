// 投影体检：所有 box-shadow 的模糊半径必须为 0（硬阴影），
// 并且 .wk 系统里卡片 / 编辑框 / tabs 必须有内阴影。
//
// 为什么单独成一条：模糊阴影（blur > 0）与设计系统的「纸＋硬偏移」是一对矛盾——它会把
// 边缘糊成一团，卡片叠在卡片上也看不出层次。这条脚本把"不要模糊"变成可回归的约束。
//
//   node scripts/check-shadow.mjs        # 打印全部声明并判定
//
// 解析范围：
//   ① CSS 里的 box-shadow 声明，以及名字里带 shadow / elev / inset 的自定义属性（令牌）；
//   ② TSX 内联 style 里的 boxShadow 字符串字面量（模板插值无法静态求值，跳过并计入 unknown）。
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em)?$/

/** 按逗号切分多层投影（跳过括号里的逗号：rgba(0,0,0,.5)、color-mix(…)） */
function splitLayers(value) {
    const out = []
    let depth = 0
    let buffer = ''
    for (const ch of value) {
        if (ch === '(') depth += 1
        if (ch === ')') depth -= 1
        if (ch === ',' && depth === 0) {
            out.push(buffer.trim())
            buffer = ''
            continue
        }
        buffer += ch
    }
    if (buffer.trim()) out.push(buffer.trim())
    return out
}

/** 返回该值的模糊半径列表（每层一个；0 表示硬阴影） */
function blurs(value) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === 'none' || trimmed === 'inherit' || trimmed === 'unset' || trimmed === 'revert') return []
    return splitLayers(trimmed).map((layer) => {
        const tokens = layer.split(/\s+/).filter((t) => t && t !== 'inset')
        const lengths = tokens.filter((t) => LENGTH.test(t))
        // 投影语法：<offset-x> <offset-y> [<blur>] [<spread>]
        const blur = lengths[2] ?? '0'
        const isZero = /^-?0(?:px|rem|em)?$/.test(blur)
        return isZero ? 0 : blur
    })
}

async function walk(dir, match, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full, match, out)
        else if (match.test(entry.name)) out.push(full.replace(/\\/g, '/'))
    }
    return out
}

/** 扫描结果：{ declarations: [{ file, line, prop, value, blurred }], unknown: [...] } */
export async function scanShadows(root = '.') {
    const declarations = []
    const unknown = []

    const push = (file, line, prop, value) => {
        if (/\bvar\(/.test(value)) {
            // 值来自令牌：由令牌自身的声明负责判定
            unknown.push({ file, line, prop, value, token: true })
            return
        }
        const bs = blurs(value)
        declarations.push({ file, line, prop, value, blurred: bs.filter(Boolean) })
    }

    for (const file of await walk(join(root, 'src'), /\.css$/)) {
        const text = await readFile(file, 'utf8')
        const lines = text.split('\n')
        lines.forEach((raw, index) => {
            // 去掉行内注释，避免把注释里的示例当成真声明
            const line = raw.replace(/\/\*.*?\*\//g, '')
            const decl = /^\s*(box-shadow|--[a-z0-9-]*(?:shadow|elev|inset)[a-z0-9-]*)\s*:\s*(.+?);?\s*$/i.exec(line)
            if (!decl) return
            push(file, index + 1, decl[1], decl[2].replace(/;\s*$/, ''))
        })
    }

    for (const file of await walk(join(root, 'src'), /\.tsx?$/)) {
        const text = await readFile(file, 'utf8')
        const lines = text.split('\n')
        lines.forEach((line, index) => {
            const match = /boxShadow\s*:\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/.exec(line)
            if (!match) return
            if (match[1] === '`' && match[2].includes('${')) {
                unknown.push({ file, line: index + 1, prop: 'boxShadow', value: match[2], token: false })
                return
            }
            push(file, index + 1, 'boxShadow', match[2])
        })
    }

    return { declarations, unknown }
}

// ── 必检面：卡片 / 编辑框 / tabs 必须有内外阴影 ────────────────────────────
const REQUIRED = [
    { file: 'src/design/wk.css', selector: '.wk-card {', need: ['--wk-elev-1', '--wk-inset-2'] },
    { file: 'src/design/wk.css', selector: '.wk-input,', need: ['--wk-elev-1', '--wk-inset-1'] },
    { file: 'src/design/wk.css', selector: '.wk-seg {', need: ['--wk-inset-1'] },
    { file: 'src/design/wk.css', selector: ".wk-seg-item[data-active='true'] {", need: ['--wk-elev-1', '--wk-inset-2'] },
    { file: 'src/design/wk-editor.css', selector: '.wk-panel {', need: ['--wk-elev-1', '--wk-inset-2'] },
    { file: 'src/design/wk-editor.css', selector: '.wk-slot {', need: ['--wk-elev-1', '--wk-inset-2'] },
    { file: 'src/design/wk-data.css', selector: '.wk-acc {', need: ['--wk-elev-1', '--wk-inset-2'] },
    { file: 'src/design/wk-overlay.css', selector: '.wk-dd-trigger {', need: ['--wk-elev-1', '--wk-inset-1'] }
]

async function checkRequired(root) {
    const missing = []
    for (const rule of REQUIRED) {
        const text = await readFile(join(root, rule.file), 'utf8')
        const at = text.indexOf(rule.selector)
        if (at < 0) {
            missing.push({ ...rule, reason: '选择器不存在' })
            continue
        }
        const block = text.slice(at, text.indexOf('}', at))
        for (const token of rule.need) {
            if (!block.includes(`var(${token})`)) missing.push({ ...rule, reason: `缺少 ${token}` })
        }
    }
    return missing
}

const isMain = process.argv[1] && /check-shadow\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))

if (isMain) {
    const root = '.'
    const { declarations, unknown } = await scanShadows(root)
    const bad = declarations.filter((d) => d.blurred.length > 0)
    const missing = await checkRequired(root)

    for (const d of declarations) {
        const status = d.blurred.length > 0 ? 'FAIL' : 'ok  '
        console.log(`[${status}] ${d.file}:${d.line}  ${d.prop}: ${d.value}`)
    }
    const tokenRefs = unknown.filter((u) => u.token).length

    console.log('')
    console.log(`投影声明 ${declarations.length} 条（全部硬阴影），引用令牌 ${tokenRefs} 处`)
    if (bad.length > 0) {
        console.log(`\n模糊半径 ≠ 0：${bad.length} 条`)
        for (const d of bad) console.log(`  ${d.file}:${d.line}  ${d.value}  → blur=${d.blurred.join(' / ')}`)
    }
    if (missing.length > 0) {
        console.log(`\n卡片 / 编辑框 / tabs 缺内外阴影：${missing.length} 处`)
        for (const m of missing) console.log(`  ${m.file} ${m.selector}  ${m.reason}`)
    }
    const fails = bad.length + missing.length
    console.log(fails === 0 ? '\n[PASS] 全部外阴影无模糊，必检面均有内外阴影' : `\n[FAIL] ${fails} 处`)
    process.exit(fails === 0 ? 0 : 1)
}
