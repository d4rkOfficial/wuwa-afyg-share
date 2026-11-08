// 用项目自身的 PostCSS（与构建同源）解析全部样式文件，确认没有语法错误
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** postcss 由 @tailwindcss/postcss 间接安装，pnpm 下不提升到顶层，这里按需定位 */
async function loadPostcss() {
    if (process.env.POSTCSS_ENTRY) return (await import(process.env.POSTCSS_ENTRY)).default
    try {
        return (await import('postcss')).default
    } catch {}
    const store = 'node_modules/.pnpm'
    const dir = readdirSync(store).find((name) => /^postcss@/.test(name))
    if (!dir) throw new Error('找不到 postcss，请设置 POSTCSS_ENTRY')
    const entry = resolve(store, dir, 'node_modules/postcss/lib/postcss.mjs').replace(/\\/g, '/')
    if (!existsSync(entry)) throw new Error(`postcss 入口不存在：${entry}`)
    return (await import(`file:///${entry}`)).default
}

const postcss = await loadPostcss()

const designDir = 'src/design'
const files = readdirSync(designDir)
    .filter((name) => name.startsWith('wk') && name.endsWith('.css'))
    .map((name) => join(designDir, name))
files.push('src/app/globals.css', 'src/components/agent.css')

let bad = 0
for (const file of files) {
    try {
        postcss.parse(readFileSync(file, 'utf8'), { from: file })
    } catch (error) {
        bad += 1
        console.log(`FAIL ${file} -> ${error.message}`)
    }
}
console.log(bad === 0 ? `PostCSS OK：${files.length} 个样式文件全部解析通过` : `PostCSS FAIL：${bad}`)

// 顺带报告重复选择器（同一声明块出现两次以上）
const core = readFileSync(join(designDir, 'wk.css'), 'utf8')
const seen = new Map()
for (const match of core.matchAll(/^(\.wk-[a-z0-9-]+[^{]*)\{/gm)) {
    const selector = match[1].trim()
    seen.set(selector, (seen.get(selector) ?? 0) + 1)
}
const dups = [...seen.entries()].filter(([, count]) => count > 1)
console.log(dups.length === 0 ? '无重复选择器' : `重复选择器 ${dups.length} 处：` + dups.map(([s, c]) => `${s} ×${c}`).join('；'))

process.exit(bad === 0 ? 0 : 1)
