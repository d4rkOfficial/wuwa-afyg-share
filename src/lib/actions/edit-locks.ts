'use server'

// 编辑锁的管理端开关（仅管理员）：
// - 全局锁：buff 集 / 标准词条集各一把
// - 条目级锁：某个 buff 实体、某个角色的标准词条集
// 写库后刷新相关页面，让首页顶部「（可编辑）」与编辑页权限立即跟着变。

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import { BUFF_ENTITY_TYPES } from '@/lib/consts/buff-zones'
import type { BuffEntityType, EditScope } from '@/lib/types/db'

export interface ActionResult {
    error?: string
}

const SCOPES: readonly EditScope[] = ['buff_sets', 'substat_sets']

function refreshEditLockPaths() {
    revalidatePath('/')
    revalidatePath('/buff-sets')
    revalidatePath('/substat-sets')
    revalidatePath('/admin/buff-sets')
    revalidatePath('/admin/substat-sets')
}

async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

/** @desc 表还没建时给出可执行的指引（而不是把 PostgREST 的原始报错甩给用户） */
function friendlyLockError(message: string): string {
    const missing =
        /does not exist|Could not find the table|relation .* does not exist|schema cache/i.test(message)
    if (missing) return '编辑锁数据表尚未创建：请先在数据库执行 supabase/migrations/edit-locks.sql'
    return message
}

/** @desc 切换某个域的全局编辑锁（locked = true 表示仅管理员可编辑） */
export async function setEditLock(scope: EditScope, locked: boolean): Promise<ActionResult> {
    if (!SCOPES.includes(scope)) return { error: '无效的编辑域' }
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    const { error } = await auth.supabase
        .from('edit_locks')
        .upsert({ scope, locked: !!locked }, { onConflict: 'scope' })
    if (error) return { error: friendlyLockError(error.message) }

    refreshEditLockPaths()
    return {}
}

/** @desc 锁定 / 解锁某个 buff 实体（条目级） */
export async function setBuffSetLock(
    entityType: BuffEntityType,
    entityName: string,
    locked: boolean
): Promise<ActionResult> {
    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        return { error: '无效的实体类型' }
    }
    const name = typeof entityName === 'string' ? entityName.trim().slice(0, 60) : ''
    if (!name) return { error: '实体名不能为空' }

    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    // 解锁时直接删行（比留 locked=false 干净：读侧只看 locked=true 的行）
    const query = locked
        ? auth.supabase
              .from('buff_set_locks')
              .upsert({ entity_type: entityType, entity_name: name, locked: true }, { onConflict: 'entity_type,entity_name' })
        : auth.supabase.from('buff_set_locks').delete().eq('entity_type', entityType).eq('entity_name', name)
    const { error } = await query
    if (error) return { error: friendlyLockError(error.message) }

    refreshEditLockPaths()
    return {}
}

/** @desc 锁定 / 解锁某个角色的标准词条集（条目级） */
export async function setSubstatSetLock(characterName: string, locked: boolean): Promise<ActionResult> {
    const name = typeof characterName === 'string' ? characterName.trim().slice(0, 60) : ''
    if (!name) return { error: '角色名不能为空' }

    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    const query = locked
        ? auth.supabase.from('substat_set_locks').upsert({ character_name: name, locked: true }, { onConflict: 'character_name' })
        : auth.supabase.from('substat_set_locks').delete().eq('character_name', name)
    const { error } = await query
    if (error) return { error: friendlyLockError(error.message) }

    refreshEditLockPaths()
    return {}
}
