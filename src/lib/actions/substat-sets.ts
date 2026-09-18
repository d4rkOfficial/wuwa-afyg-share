'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import { validateEchoPlan } from '@/lib/utils/echo-plan'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

const MAX_CHARACTER_NAME_LEN = 60
const MAX_NOTE_LEN = 200

// 仅管理员（保存 / 删除；DB 层 RLS 同步限制）
async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

export interface UpsertSubstatSetInput {
    characterName: string
    /** 整份 plan：校验失败返回 { error }，不做部分写入 */
    plan: unknown
    note?: string | null
}

/**
 * 保存（新增或覆盖）一个角色的标准词条方案。
 * 校验：slots 恰好 5 项 / cost 多重集合 {4,3,3,1,1} / 每部位副词条 1-5 条且 type 不重复 /
 *       副词条合计恰好 14 条 / 词条 type 与 unit 白名单（见 src/lib/utils/echo-plan.ts）。
 */
export async function upsertSubstatSet(input: UpsertSubstatSetInput): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const characterName = typeof input?.characterName === 'string' ? input.characterName.trim() : ''
    if (!characterName) return { error: '角色名不能为空' }
    if (characterName.length > MAX_CHARACTER_NAME_LEN) {
        return { error: `角色名过长（最多 ${MAX_CHARACTER_NAME_LEN} 字）` }
    }

    const checked = validateEchoPlan(input?.plan)
    if (!checked.ok) return { error: checked.error }

    const rawNote = typeof input?.note === 'string' ? input.note.trim().slice(0, MAX_NOTE_LEN) : ''
    const { error } = await supabase.from('standard_substat_sets').upsert(
        {
            character_name: characterName,
            plan: checked.plan,
            note: rawNote || null
        },
        { onConflict: 'character_name' }
    )
    if (error) return { error: error.message }

    revalidatePath('/admin/substat-sets')
    return {}
}

/** 删除某个角色的标准词条方案（不存在时同样返回成功，保持幂等） */
export async function deleteSubstatSet(characterName: string): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const name = typeof characterName === 'string' ? characterName.trim() : ''
    if (!name) return { error: '角色名不能为空' }

    const { error } = await supabase.from('standard_substat_sets').delete().eq('character_name', name)
    if (error) return { error: error.message }

    revalidatePath('/admin/substat-sets')
    return {}
}
