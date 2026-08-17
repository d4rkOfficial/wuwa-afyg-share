// ── 上游数据统一入口 ──────────────────────────────────────────────────────
// share 所有“读取上游游戏数据”的地方都应经过这里，直连上游（nanoka），
// 与 wuwa-afyg-tool 同源逻辑，不再经过 tool 的 API。

import type { BuffEntityType } from '@/lib/types/db'
import { getProvider } from './provider/registry'

export interface ToolListEntry {
    name: string
    star?: number
    element?: string
    weaponType?: string
    sets?: string[]
    cost?: number
    pieces?: number[]
}

export { getProvider } from './provider/registry'

/** 拉取某类实体的列表（名称等基础字段）。 */
export async function fetchEntityList(entityType: BuffEntityType): Promise<ToolListEntry[]> {
    const p = getProvider()
    switch (entityType) {
        case 'character':
            return (await p.getCharacterList()) as ToolListEntry[]
        case 'weapon':
            return (await p.getWeaponList()) as ToolListEntry[]
        case 'echo':
            return (await p.getEchoList()) as ToolListEntry[]
        default:
            // 1set..5set 都对应声骸套装
            return (await p.getEchoSetList()) as ToolListEntry[]
    }
}

/** 拉取单个实体的官方详情（角色技能/武器效果/声骸技能/套装加成等）。 */
export async function fetchEntityInfo(entityType: BuffEntityType, entityName: string): Promise<unknown> {
    const p = getProvider()
    switch (entityType) {
        case 'character':
            return p.getCharacterInfo(entityName)
        case 'weapon':
            return p.getWeaponInfo(entityName)
        case 'echo':
            return p.getEchoInfo(entityName)
        default:
            return p.getEchoSetInfo(entityName)
    }
}
