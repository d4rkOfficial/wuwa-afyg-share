// 从椰果工具箱公开 API 拉取实体 info，供 AI 分析（base 由前端管理员填写）
import type { BuffEntityType } from '@/lib/types/db'

// Buff 实体类型 → 工具箱 info 接口的 entity 段
export function toolEntityName(entityType: BuffEntityType): 'character' | 'weapon' | 'echo' | 'echo-set' {
    if (entityType === 'character') return 'character'
    if (entityType === 'weapon') return 'weapon'
    if (entityType === 'echo') return 'echo'
    return 'echo-set' // 1set..5set 都是声骸套装
}

export function normalizeToolBase(base: string): string {
    return (base || '').trim().replace(/\/+$/, '')
}

export interface ToolListEntry {
    name: string
    star?: number
    element?: string
    weaponType?: string
    sets?: string[]
    cost?: number
    pieces?: number[]
}

export async function fetchToolList(toolBase: string, entityType: BuffEntityType): Promise<ToolListEntry[]> {
    const base = normalizeToolBase(toolBase)
    if (!base) throw new Error('未配置工具箱地址')
    const entity = toolEntityName(entityType)
    const url = `${base}/api/v1/list/${entity}`
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    })
    if (!res.ok) {
        if (res.status === 404) throw new Error(`工具箱未找到该类型的目录`)
        throw new Error(`工具箱目录接口失败（HTTP ${res.status}）`)
    }
    const json = (await res.json()) as unknown
    if (!Array.isArray(json)) return []
    return json
        .map((raw) => (raw && typeof raw === 'object' ? raw : {}))
        .map((raw) => {
            const o = raw as Record<string, unknown>
            return {
                name: String(o.name ?? '').trim(),
                star: typeof o.star === 'number' ? o.star : undefined,
                element: typeof o.element === 'string' ? o.element : undefined,
                weaponType: typeof o.weaponType === 'string' ? o.weaponType : undefined,
                sets: Array.isArray(o.sets) ? (o.sets as string[]) : undefined,
                cost: typeof o.cost === 'number' ? o.cost : undefined,
                pieces: Array.isArray(o.pieces) ? (o.pieces as number[]) : undefined
            }
        })
        .filter((e) => e.name)
}

export async function fetchToolInfo(toolBase: string, entityType: BuffEntityType, entityName: string): Promise<unknown> {
    const base = normalizeToolBase(toolBase)
    if (!base) throw new Error('未配置工具箱地址')
    const entity = toolEntityName(entityType)
    const url = `${base}/api/v1/info/${entity}/${encodeURIComponent(entityName)}`
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
    })
    if (!res.ok) {
        if (res.status === 404) throw new Error(`工具箱未找到「${entityName}」的信息`)
        throw new Error(`工具箱信息接口失败（HTTP ${res.status}）`)
    }
    const json = await res.json()
    return (json as { error?: string }).error ? null : json
}

// 交给 AI 前裁剪噪音字段：
// - 武器：主词条(lv90BaseAtk)、副词条(substat) 不算 buff，只保留效果 effect
// - 角色：lv90BaseStats（基础生命/攻击/防御）不算 buff，剔除
export function prepareAiInfo(entityType: BuffEntityType, info: unknown): unknown {
    if (info && typeof info === 'object') {
        const o = info as Record<string, unknown>
        if (entityType === 'weapon') {
            return { effect: o.effect }
        }
        if (entityType === 'character') {
            const rest: Record<string, unknown> = { ...o }
            delete rest.lv90BaseStats
            return rest
        }
    }
    return info
}
