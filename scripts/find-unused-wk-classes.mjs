// 找出 wk.css 里「定义了但没人用」的类（用于真实减行，而不是压缩格式）
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const css = await readFile('src/design/wk.css', 'utf8')
const defined = new Set([...css.matchAll(/\.(wk-[a-z0-9-]+)/g)].map((m) => m[1]))

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full, out)
        else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full)
    }
    return out
}

const files = await walk('src')
let usedText = ''
for (const file of files) usedText += await readFile(file, 'utf8')

/**
 * 运行时拼出来的变体类：`wk-badge--${tone}`、`wk-toast--${kind}` 这种在源码里搜不到完整名字，
 * 直接按文本匹配会把整族都报成"未使用"。族前缀一旦在用就跳过它的变体。
 */
const COMPOSED_PREFIXES = ['wk-badge--', 'wk-toast--', 'wk-btn--', 'wk-menu-item--', 'wk-tr--', 'wk-nav--', 'wk-tab-']

const unused = [...defined].filter((name) => {
    if (COMPOSED_PREFIXES.some((prefix) => name.startsWith(prefix))) return false
    const re = new RegExp(`(?<![\\w-])${name}(?![\\w-])`)
    // 只在 TSX/TS 里找使用；CSS 自身与设计系统导出不算使用
    for (const file of files) {
        if (file.includes('src/design/')) continue
    }
    return !re.test(usedText.replace(css, ''))
})

console.log(`wk.css 定义的类：${defined.size}`)
console.log(`疑似未被使用：${unused.length}`)
for (const name of unused.sort()) console.log('  ' + name)
