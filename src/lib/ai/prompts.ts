import { BUFF_ZONES, BUFF_ENTITY_LABELS, BUFF_SCOPE_LABELS, BUFF_REF_ZONES } from '@/lib/consts/buff-zones'
import {
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_INITIAL_TASK_PROMPT,
    DEFAULT_SLANG_DICT
} from '@/lib/ai/prompts.config'

// 乘区白名单表（保留在 system，作为 zoneId 校验边界）
export const ZONE_LIST_TEXT = BUFF_ZONES.map(
    (z) => `- ${z.id}（${z.label}，单位：${z.unit === '%' ? '百分数' : '固定值'}）`
).join('\n')

// 引用乘区表（保留在 system，作为 ref.targetZoneId 校验边界）
export const REF_ZONE_LIST_TEXT = BUFF_REF_ZONES.map(
    (z) => `- ${z.id}（${z.label}，单位：${z.unit === '%' ? '百分数' : '固定值'}）`
).join('\n')

export function renderSystemPrompt(template: string): string {
    return template.replaceAll('{ZONE_LIST}', ZONE_LIST_TEXT).replaceAll('{REF_ZONE_LIST}', REF_ZONE_LIST_TEXT)
}

export interface RenderUserContext {
    entityType: string
    entityName: string
}

export function renderInitialTaskPrompt(template: string, { entityType, entityName }: RenderUserContext): string {
    const label = BUFF_ENTITY_LABELS[entityType as keyof typeof BUFF_ENTITY_LABELS] ?? entityType
    return template
        .replaceAll('{ENTITY_TYPE}', label)
        .replaceAll('{ENTITY_TYPE_RAW}', entityType)
        .replaceAll('{ENTITY_NAME}', entityName)
}

// 供前端展示的 scope 标签映射（复用常量，避免重复）
export { BUFF_SCOPE_LABELS }
export {
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_INITIAL_TASK_PROMPT,
    DEFAULT_SLANG_DICT
}
