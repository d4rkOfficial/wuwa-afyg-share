// 编辑锁 UI 守卫：条目级锁的 server action 必须真的有调用方。
//
// 为什么需要这条：这些 action 定义好之后，曾经因为编辑台重写把入口按钮删掉，
// 变成「定义在、没人调」的孤儿 —— 锁还在生效（保存被拦），但页面上再也找不到开关。
// 这种回归不会让构建失败、也不会让类型检查失败，只能靠这条脚本兜住。
//
// 判定方式：在 src/ 里找 `actionName(` 的调用（import 语句里没有括号，不会被误算），
// 定义文件自身不计入。
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const DEFINING_FILE = 'src/lib/actions/edit-locks.ts'

/** action 名 → 它控制的东西（用于报错文案） */
const REQUIRED = {
    setBuffSetLock: 'Buff 实体的条目级编辑锁（/edit/buff-sets 实体头部的锁图标）',
    setSubstatSetLock: '标准词条集的条目级编辑锁（/edit/substat-sets 工具条的锁图标）'
}

async function walk(dir, out = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) await walk(full, out)
        else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full.replace(/\\/g, '/'))
    }
    return out
}

const files = await walk('src')
const callSites = Object.fromEntries(Object.keys(REQUIRED).map((name) => [name, []]))

for (const file of files) {
    if (file === DEFINING_FILE) continue
    const text = await readFile(file, 'utf8')
    for (const name of Object.keys(REQUIRED)) {
        // 只认调用：`name(` —— import 里写的是 `{ name }`，不会命中
        if (new RegExp(`\\b${name}\\s*\\(`).test(text)) callSites[name].push(file)
    }
}

let failed = 0
for (const [name, sites] of Object.entries(callSites)) {
    if (sites.length === 0) {
        failed += 1
        console.log(`[FAIL] ${name}() 没有任何调用方 → ${REQUIRED[name]} 会变成没有入口的孤儿`)
        continue
    }
    console.log(`[ok  ] ${name}() ← ${sites.join(', ')}`)
}

console.log(
    failed === 0
        ? `\n[PASS] ${Object.keys(REQUIRED).length} 个条目级锁 action 都有 UI 入口`
        : `\n[FAIL] ${failed} 个条目级锁 action 没有入口`
)
process.exit(failed === 0 ? 0 : 1)
