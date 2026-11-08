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
    /**
     * @desc Buff 短名（全名的最后一段）：`效果名+数值(+层数/阶数)`，如 `暴击率15%` / `攻击10%(2层)`。
     *  不带文件夹前缀、不带反斜杠。
     */
    buffName: string
    /**
     * @desc 一级文件夹 = 游戏原文案（去掉增益数值，保留「持续10秒 / 切人掉」这类限定语）。
     *  与 buffName 一起拼成全名 `原文案 \ 效果`；留空表示放在根目录。
     */
    folder?: string
    scope?: BuffScope
    exclusive?: boolean
    /** @desc 实例级生效条件（链/阶硬门槛，链阶互斥） */
    condition?: BuffCondition | null
    zones: GeneratedZone[]
}
