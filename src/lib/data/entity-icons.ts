// 实体图标的纯函数工具（客户端也能用）。
// 只依赖类型，不 import 上游 provider —— `import type` 在编译期被擦除，不会把服务端模块带进客户端包。
import type { BuffEntityType } from '@/lib/types/db'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'

/** 套装是 1set…5set 五种 entity_type，展示与图标都并成「套装」一类 */
export const isSetEntityType = (type: BuffEntityType): boolean => /^[1-5]set$/.test(type)

/** @desc 实体 → 图标地址（没有对应表或找不到时返回 undefined，由调用方降级） */
export function entityIconFor(
    type: BuffEntityType,
    name: string,
    icons?: EntityIconMaps
): string | undefined {
    if (!icons) return undefined
    if (isSetEntityType(type)) return icons.set?.[name]
    if (type === 'character') return icons.character?.[name]
    if (type === 'weapon') return icons.weapon?.[name]
    if (type === 'echo') return icons.echo?.[name]
    return undefined
}
