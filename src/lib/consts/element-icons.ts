// 属性图标与配色（静态资源在 public/icons/element/；移植自 wuwa-afyg-tool 的 ELEMENT_ICONS / ELEMENT_COLORS）
import type { Element } from '@/lib/types/project'

const ELEMENT_ICON_PATHS: Record<Element, string> = {
    物理: '/icons/element/物理.webp',
    冷凝: '/icons/element/冷凝.webp',
    热熔: '/icons/element/热熔.webp',
    导电: '/icons/element/导电.webp',
    气动: '/icons/element/气动.webp',
    衍射: '/icons/element/衍射.webp',
    湮灭: '/icons/element/湮灭.webp'
}

/** 属性 → 图标路径；无对应图标（理论仅物理）时返回空串 */
export const elementIcon = (el: string): string => ELEMENT_ICON_PATHS[el as Element] ?? ''

export const CHARACTER_PLACEHOLDER = '/icons/placeholder-character.svg'
