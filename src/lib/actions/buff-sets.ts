'use server'

import { revalidatePath } from 'next/cache'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { BUFF_ENTITY_TYPES, BUFF_ZONE_MAP } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

async function requireAdmin() {
    if (!hasEnv()) return { supabase: null, error: '服务未配置' }
    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) return { supabase, error: '请先登录' }
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile?.is_admin) return { supabase, error: '无权限：仅管理员可编辑 Buff 集' }
    return { supabase, error: null as string | null }
}

interface ZoneInput {
    zoneId: string
    value: number
    override?: boolean
}

export interface InputBuff {
    entityType: BuffEntityType
    entityName: string
    buffName: string
    zones: ZoneInput[]
}

function sanitizeZones(zones: unknown): ZoneInput[] {
    if (!Array.isArray(zones)) return []
    const out: ZoneInput[] = []
    const seen = new Set<string>()
    for (const z of zones) {
        const zoneId = typeof z?.zoneId === 'string' ? z.zoneId.trim() : ''
        if (!BUFF_ZONE_MAP.has(zoneId) || seen.has(zoneId)) continue
        seen.add(zoneId)
        const value = typeof z?.value === 'number' && Number.isFinite(z.value) ? z.value : 0
        out.push({ zoneId, value, ...(z?.override ? { override: true } : {}) })
    }
    return out
}

export async function upsertBuffSet(input: InputBuff): Promise<ActionResult> {
    const auth = await requireAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const entityType = input.entityType
    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        return { error: '无效的实体类型' }
    }
    const entityName = input.entityName.trim().slice(0, 60)
    const buffName = input.buffName.trim().slice(0, 80)
    if (!entityName || !buffName) return { error: '实体名与增益名不能为空' }

    const { error } = await supabase.from('buff_sets').upsert(
        {
            entity_type: entityType,
            entity_name: entityName,
            buff_name: buffName,
            buff_set: sanitizeZones(input.zones)
        },
        { onConflict: 'entity_type,entity_name,buff_name' }
    )
    if (error) return { error: error.message }
    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return {}
}

export async function deleteBuffPreset(
    entityType: BuffEntityType,
    entityName: string,
    buffName: string
): Promise<ActionResult> {
    const auth = await requireAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { error } = await supabase
        .from('buff_sets')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_name', entityName)
        .eq('buff_name', buffName)
    if (error) return { error: error.message }
    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return {}
}