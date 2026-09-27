// AI 辅助生成的类型（与 buff_sets 的 buff_set 结构一致）
import type { BuffScope, BuffRefOwner, BuffCondition } from '@/lib/types/db'

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
    /** @desc 乘区级生效条件（伤害类型 / 伤害属性；链阶只能挂在 Buff 实例级） */
    condition?: BuffCondition
}

export interface GeneratedBuff {
    buffName: string
    scope?: BuffScope
    exclusive?: boolean
    /** @desc 实例级生效条件（链/阶硬门槛，链阶互斥） */
    condition?: BuffCondition | null
    zones: GeneratedZone[]
}
