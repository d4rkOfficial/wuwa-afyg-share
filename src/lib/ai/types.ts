// AI 辅助生成的类型（与 buff_sets 的 buff_set 结构一致）
import type { BuffScope, BuffRefOwner } from '@/lib/types/db'

export interface GeneratedZoneRef {
    targetZoneId: string
    pct: number
    threshold?: number
    lower?: number
    upper?: number
    discrete?: boolean
    divisor?: number
    multiplier?: number
    refOwner?: BuffRefOwner
}

export interface GeneratedZone {
    zoneId: string
    value: number
    ref?: GeneratedZoneRef
    override?: boolean
}

export interface GeneratedBuff {
    buffName: string
    scope?: BuffScope
    exclusive?: boolean
    zones: GeneratedZone[]
}
