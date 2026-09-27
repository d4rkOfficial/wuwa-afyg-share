'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import {
    BUFF_ENTITY_TYPES,
    BUFF_ZONE_MAP,
    ZONE_NO_REF_IDS,
    ZONE_NO_OVERRIDE_IDS,
    BUFF_REF_ZONE_MAP,
    BUFF_SCOPES,
    resolveBuffZoneId,
    sanitizeCondition,
    sanitizeZoneCondition,
    isConditionEmpty,
    type BuffConditionScope
} from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffCondition, BuffScope, BuffRefOwner } from '@/lib/types/db'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
    debug?: string
}

// 仅管理员（保存 / 删除等写操作；DB 层 RLS 同步限制）
async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

interface ZoneRefInput {
    targetZoneId?: string
    pct?: number
    threshold?: number
    lower?: number
    upper?: number
    discrete?: boolean
    divisor?: number
    multiplier?: number
    refOwner?: BuffRefOwner
}

interface ZoneInput {
    zoneId: string
    value: number
    ref?: ZoneRefInput | null
    override?: boolean
    condition?: BuffCondition | null
}

export interface InputBuff {
    entityType: BuffEntityType
    entityName: string
    buffName: string
    scope?: BuffScope
    exclusive?: boolean
    condition?: BuffCondition | null
    zones: ZoneInput[]
}

function sanitizeRef(ref: unknown): ZoneRefInput | undefined {
    if (!ref || typeof ref !== 'object') return undefined
    const r = ref as Record<string, unknown>
    const targetZoneId = typeof r.targetZoneId === 'string' ? r.targetZoneId.trim() : ''
    if (!BUFF_REF_ZONE_MAP.has(targetZoneId)) return undefined
    const pct = typeof r.pct === 'number' && Number.isFinite(r.pct) ? r.pct : 0
    if (!Number.isFinite(pct)) return undefined
    const out: ZoneRefInput = { targetZoneId, pct }
    if (typeof r.threshold === 'number' && Number.isFinite(r.threshold)) out.threshold = r.threshold
    if (typeof r.lower === 'number' && Number.isFinite(r.lower)) out.lower = r.lower
    if (typeof r.upper === 'number' && Number.isFinite(r.upper)) out.upper = r.upper
    if (r.discrete) out.discrete = true
    if (typeof r.divisor === 'number' && Number.isFinite(r.divisor)) out.divisor = r.divisor
    if (typeof r.multiplier === 'number' && Number.isFinite(r.multiplier)) out.multiplier = r.multiplier
    if (r.refOwner === 'self' || r.refOwner === 'owner') out.refOwner = r.refOwner
    return out
}

/**
 * @desc 清洗乘区贡献条目列表（与工具箱「一切皆 buff」口径一致）：
 * - zoneId 走旧 id 别名重映射 + 白名单校验
 * - **同一乘区可出现多次**（每次是独立贡献单元），仅剔除完全重复的条目（同乘区 + 同覆盖 + 同条件）
 * - 覆盖：extraRatio/百分比类乘区不支持覆盖；同一乘区内**只允许一个**覆盖条目（后写的取消先写的）
 * - 乘区级条件只保留伤害类型 / 伤害属性；层数类乘区丢弃引用
 */
function sanitizeZones(zones: unknown): ZoneInput[] {
    if (!Array.isArray(zones)) return []
    const out: ZoneInput[] = []
    const seen = new Set<string>()
    for (const z of zones) {
        const raw = typeof z?.zoneId === 'string' ? z.zoneId.trim() : ''
        const zoneId = resolveBuffZoneId(raw)
        if (!BUFF_ZONE_MAP.has(zoneId)) continue
        const value = typeof z?.value === 'number' && Number.isFinite(z.value) ? z.value : 0
        const override = !!z?.override && !ZONE_NO_OVERRIDE_IDS.has(zoneId)
        // 层数类乘区（集谐干涉/同奏增益等）只填固定层数，不保留引用
        const ref = ZONE_NO_REF_IDS.has(zoneId) ? undefined : sanitizeRef(z?.ref)
        // 带引用的条目覆盖标记由引用接管（与工具箱一致：设引用即清覆盖）
        const finalOverride = ref ? false : override
        const condition = sanitizeZoneCondition(z?.condition)
        const dedupeKey = `${zoneId}|${finalOverride ? 'o' : 'a'}|${condition ? JSON.stringify(condition) : ''}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        out.push({
            zoneId,
            value,
            ...(ref ? { ref } : {}),
            ...(finalOverride ? { override: true } : {}),
            ...(condition ? { condition } : {})
        })
    }
    // 同一乘区内只保留一个覆盖条目（最后出现的生效，与工具箱「同乘区覆盖唯一」一致）
    const overrideKept = new Set<string>()
    const deduped: ZoneInput[] = []
    for (let i = out.length - 1; i >= 0; i--) {
        const zone = out[i]
        if (zone.override) {
            if (overrideKept.has(zone.zoneId)) continue
            overrideKept.add(zone.zoneId)
        }
        deduped.unshift(zone)
    }
    return deduped
}

function normalizeScope(scope: unknown): BuffScope {
    return scope && BUFF_SCOPES.includes(scope as BuffScope) ? (scope as BuffScope) : 'team'
}

// 条件按挂载层级清洗：实例级保留链/阶硬门槛（链阶互斥），乘区级只保留类型/属性
function sanitizeConditionForScope(cond: unknown, scope: BuffConditionScope): BuffCondition | null {
    const clean = sanitizeCondition(cond, scope)
    return clean && !isConditionEmpty(clean) ? clean : null
}

export async function upsertBuffSet(input: InputBuff): Promise<ActionResult> {
    const auth = await withAdmin()
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
            scope: normalizeScope(input.scope),
            exclusive: !!input.exclusive,
            condition: sanitizeConditionForScope(input.condition, 'buff'),
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
    const auth = await withAdmin()
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

export interface InputEntityBuff {
    buffName: string
    scope?: BuffScope
    exclusive?: boolean
    condition?: BuffCondition | null
    zones: ZoneInput[]
}

export interface UpsertEntityInput {
    entityType: BuffEntityType
    entityName: string
    buffs: InputEntityBuff[]
}

export async function upsertBuffEntity(input: UpsertEntityInput): Promise<ActionResult<{ saved: number }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const entityType = input.entityType
    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        return { error: '无效的实体类型' }
    }
    const entityName = input.entityName.trim().slice(0, 60)
    if (!entityName) return { error: '实体名不能为空' }

    // 整体替换：先删除该实体全部行，再写回
    const { error: delErr } = await supabase
        .from('buff_sets')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_name', entityName)
    if (delErr) return { error: delErr.message }

    const buffs = (input.buffs ?? [])
        .map((b) => ({
            buffName: b.buffName.trim().slice(0, 80),
            scope: normalizeScope(b.scope),
            exclusive: !!b.exclusive,
            condition: sanitizeConditionForScope(b.condition, 'buff'),
            zones: sanitizeZones(b.zones)
        }))
        .filter((b) => b.buffName && b.zones.length > 0)

    if (buffs.length > 0) {
        const rows = buffs.map((b) => ({
            entity_type: entityType,
            entity_name: entityName,
            buff_name: b.buffName,
            scope: b.scope,
            exclusive: b.exclusive,
            condition: b.condition,
            buff_set: b.zones
        }))
        const { error } = await supabase.from('buff_sets').insert(rows)
        if (error) return { error: error.message }
    }

    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return { data: { saved: buffs.length } }
}

export async function deleteBuffEntity(
    entityType: BuffEntityType,
    entityName: string
): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { error } = await supabase
        .from('buff_sets')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_name', entityName)
    if (error) return { error: error.message }
    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return {}
}