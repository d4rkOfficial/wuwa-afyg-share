// 从上游读取实体 info，供 AI 分析。现已统一走 @/lib/upstream 直连上游（nanoka）。
import type { BuffEntityType } from '@/lib/types/db'
import { fetchEntityList, fetchEntityInfo, type ToolListEntry } from '@/lib/upstream'

export type { ToolListEntry }

// Buff 实体类型 → 工具箱 info 接口的 entity 段（保留以便旧调用/调试）
export function toolEntityName(entityType: BuffEntityType): 'character' | 'weapon' | 'echo' | 'echo-set' {
    if (entityType === 'character') return 'character'
    if (entityType === 'weapon') return 'weapon'
    if (entityType === 'echo') return 'echo'
    return 'echo-set' // 1set..5set 都是声骸套装
}

export async function fetchToolList(entityType: BuffEntityType): Promise<ToolListEntry[]> {
    return fetchEntityList(entityType)
}

export async function fetchToolInfo(entityType: BuffEntityType, entityName: string): Promise<unknown> {
    return fetchEntityInfo(entityType, entityName)
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
