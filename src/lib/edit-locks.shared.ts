// 编辑锁的**纯数据/纯函数**部分（客户端也能安全引用）。
//
// 为什么单独一个文件：`edit-locks.ts` 里要读数据库（依赖 supabase 的 server client / next/headers），
// 客户端组件（AI 控制台、编辑页的锁开关展示）只想要类型和判定函数，直接 import 会把 server-only
// 依赖拖进浏览器包（构建期就会报 "Client Component Browser" 错误）。
import type { EditScope } from '@/lib/types/db'

export interface EditLockState {
    /** @desc buff 集全局锁（true = 仅管理员可编辑） */
    buffSetsLocked: boolean
    /** @desc 标准词条集全局锁（true = 仅管理员可编辑） */
    substatSetsLocked: boolean
}

export interface EditLocksSnapshot extends EditLockState {
    /** @desc 被单独锁定的 buff 实体（key = `类型/名称`） */
    buffLocks: Record<string, boolean>
    /** @desc 被单独锁定的标准词条集角色 */
    substatLocks: Record<string, boolean>
}

/** @desc buff 实体的锁 key（`类型/名称`，与页面里的实体 key 同形） */
export const buffLockKey = (entityType: string, entityName: string): string => `${entityType}/${entityName}`

export const LOCKED_STATE: EditLocksSnapshot = {
    buffSetsLocked: true,
    substatSetsLocked: true,
    buffLocks: {},
    substatLocks: {}
}

/** @desc 某个 buff 实体当前是否可被「非管理员」编辑 */
export function canNonAdminEditBuff(locks: EditLocksSnapshot, entityType: string, entityName: string): boolean {
    if (locks.buffSetsLocked) return false
    return !locks.buffLocks[buffLockKey(entityType, entityName)]
}

/** @desc 某个标准词条集角色当前是否可被「非管理员」编辑 */
export function canNonAdminEditSubstat(locks: EditLocksSnapshot, characterName: string): boolean {
    if (locks.substatSetsLocked) return false
    return !locks.substatLocks[characterName]
}

/** @desc 全局锁是否关闭（供页面文案判断「可编辑」） */
export const isScopeUnlocked = (locks: EditLocksSnapshot, scope: EditScope): boolean =>
    scope === 'buff_sets' ? !locks.buffSetsLocked : !locks.substatSetsLocked
