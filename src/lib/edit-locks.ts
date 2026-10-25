// 编辑锁的服务端读写与判定（全局锁 + 条目级锁）。
// 只在服务端使用（server actions / server components）；客户端只能读传下去的 props。
//
// 约定（与 supabase/migrations/edit-locks.sql 的 RLS 策略同口径）：
// - 管理员始终可编辑；
// - 全局锁关闭（edit_locks.locked = false）时，**登录用户**可以编辑该域；
// - 条目被单独锁定（buff_set_locks / substat_set_locks）时，该条目仍然只有管理员能编辑；
// - 读不到锁表（SQL 未执行 / 网络异常）时一律按「锁定」处理 —— 即退回原来的「仅管理员可编辑」，
//   绝不因为读不到状态就意外向所有人放开写权限。

import { cache } from 'react'
import { createClient, hasEnv } from '@/lib/supabase/server'
import type { BuffEntityType, EditScope } from '@/lib/types/db'

export interface EditLockState {
    /** @desc buff 集全局锁（true = 仅管理员可编辑） */
    buffSetsLocked: boolean
    /** @desc 标准词条集全局锁（true = 仅管理员可编辑） */
    substatSetsLocked: boolean
}

export interface EditLocksSnapshot extends EditLockState {
    /** @desc 被单独锁定的 buff 实体（key 见 `buffLockKey`） */
    buffLocks: Record<string, boolean>
    /** @desc 被单独锁定的标准词条集角色 */
    substatLocks: Record<string, boolean>
}

/** @desc buff 实体的锁 key（`类型/名称`，与页面里的实体 key 同形） */
export const buffLockKey = (entityType: BuffEntityType | string, entityName: string): string =>
    `${entityType}/${entityName}`

export const LOCKED_STATE: EditLocksSnapshot = {
    buffSetsLocked: true,
    substatSetsLocked: true,
    buffLocks: {},
    substatLocks: {}
}

type DbClient = Awaited<ReturnType<typeof createClient>>

/**
 * @desc 读取全部锁状态。任何一步失败都退回「全部锁定」（fail-closed）。
 * 锁表是公开只读的，匿名访客也能读 —— 首页 / 导航据此显示「（可编辑）」。
 */
export async function loadEditLocks(supabase?: DbClient): Promise<EditLocksSnapshot> {
    if (!supabase) {
        if (!hasEnv()) return { ...LOCKED_STATE }
        supabase = await createClient()
    }

    const [globalRes, buffRes, substatRes] = await Promise.all([
        supabase.from('edit_locks').select('scope, locked'),
        supabase.from('buff_set_locks').select('entity_type, entity_name, locked').eq('locked', true),
        supabase.from('substat_set_locks').select('character_name, locked').eq('locked', true)
    ])
    // 表还没建（未执行 edit-locks.sql）：按锁定处理，站点行为与改动前完全一致
    if (globalRes.error) return { ...LOCKED_STATE }

    const byScope = new Map<string, boolean>()
    for (const row of (globalRes.data ?? []) as Array<{ scope: string; locked: boolean }>) {
        byScope.set(row.scope, !!row.locked)
    }
    const buffLocks: Record<string, boolean> = {}
    for (const row of (buffRes.data ?? []) as Array<{ entity_type: string; entity_name: string }>) {
        buffLocks[buffLockKey(row.entity_type, row.entity_name)] = true
    }
    const substatLocks: Record<string, boolean> = {}
    for (const row of (substatRes.data ?? []) as Array<{ character_name: string }>) {
        substatLocks[row.character_name] = true
    }

    return {
        // 缺行同样按锁定处理
        buffSetsLocked: byScope.get('buff_sets') ?? true,
        substatSetsLocked: byScope.get('substat_sets') ?? true,
        buffLocks,
        substatLocks
    }
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

export async function isAdminUserId(supabase: DbClient, userId: string | undefined | null): Promise<boolean> {
    if (!userId) return false
    const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
    return !!data?.is_admin
}

export interface ViewerLocks {
    /** @desc 是否管理员（未登录恒为 false） */
    isAdmin: boolean
    /** @desc 是否已登录 */
    signedIn: boolean
    locks: EditLocksSnapshot
}

/**
 * @desc 当前访客能看到的锁状态（按请求缓存：布局 / 顶栏 / 页面多处调用只打一次库）。
 */
export const getViewerLocks = cache(async (): Promise<ViewerLocks> => {
    if (!hasEnv()) return { isAdmin: false, signedIn: false, locks: { ...LOCKED_STATE } }
    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    const isAdmin = user ? await isAdminUserId(supabase, user.id) : false
    const locks = await loadEditLocks(supabase)
    return { isAdmin, signedIn: Boolean(user), locks }
})

export type EditPermission = { ok: true } | { ok: false; error: string }

/** @desc 写操作前的判定：管理员 → 放行；否则要求「已登录 + 全局锁关闭 + 该条目未锁」 */
export async function authorizeBuffEntityEdit(
    supabase: DbClient,
    userId: string | undefined | null,
    entityType: string,
    entityName: string
): Promise<EditPermission> {
    if (!userId) return { ok: false, error: '请先登录' }
    if (await isAdminUserId(supabase, userId)) return { ok: true }
    const locks = await loadEditLocks(supabase)
    if (locks.buffSetsLocked) return { ok: false, error: 'Buff 集编辑已锁定，仅管理员可修改' }
    if (locks.buffLocks[buffLockKey(entityType, entityName)]) {
        return { ok: false, error: `「${entityName}」的 Buff 集已被管理员锁定，仅管理员可修改` }
    }
    return { ok: true }
}

/** @desc 标准词条集的写操作判定（口径同上） */
export async function authorizeSubstatSetEdit(
    supabase: DbClient,
    userId: string | undefined | null,
    characterName: string
): Promise<EditPermission> {
    if (!userId) return { ok: false, error: '请先登录' }
    if (await isAdminUserId(supabase, userId)) return { ok: true }
    const locks = await loadEditLocks(supabase)
    if (locks.substatSetsLocked) return { ok: false, error: '标准词条集编辑已锁定，仅管理员可修改' }
    if (locks.substatLocks[characterName]) {
        return { ok: false, error: `「${characterName}」的标准词条集已被管理员锁定，仅管理员可修改` }
    }
    return { ok: true }
}

/** @desc 全局锁是否关闭（供页面文案判断「可编辑」） */
export const isScopeUnlocked = (locks: EditLocksSnapshot, scope: EditScope): boolean =>
    scope === 'buff_sets' ? !locks.buffSetsLocked : !locks.substatSetsLocked
