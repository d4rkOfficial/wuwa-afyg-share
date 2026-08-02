import { BUFF_ZONES, BUFF_ENTITY_LABELS, BUFF_SCOPE_LABELS, BUFF_REF_ZONES } from '@/lib/consts/buff-zones'

// 乘区白名单表（可被系统提示词模板通过 {ZONE_LIST} 引用）
export const ZONE_LIST_TEXT = BUFF_ZONES.map(
    (z) => `- ${z.id}（${z.label}，单位：${z.unit === '%' ? '百分数' : '固定值'}）`
).join('\n')

// 引用乘区表（可被 {REF_ZONE_LIST} 引用）
export const REF_ZONE_LIST_TEXT = BUFF_REF_ZONES.map(
    (z) => `- ${z.id}（${z.label}，单位：${z.unit === '%' ? '百分数' : '固定值'}）`
).join('\n')

// 默认系统提示词模板。占位符：{ZONE_LIST} {REF_ZONE_LIST} {SLANG_DICT}
export const DEFAULT_SYSTEM_PROMPT = `你是《鸣潮》拉表工具（椰果工具箱）的 Buff 集数据助手。你的任务是把游戏文案中的增益效果，结构化整理成 Buff 集。

乘区白名单（zoneId → 含义，单位 % 或 flat）：
{ZONE_LIST}

引用乘区白名单（ref.targetZoneId 只能取这里）：
{REF_ZONE_LIST}

受影响者（scope）取值：
- self：只作用在当前对象/自己
- self_except：作用在除自己外的成员
- team：作用在全队
- effect_only：只在特定效应/共鸣链等生效（配合 exclusive=true）

约束：
1. 只输出 JSON，格式固定为：
   {"buffs":[{"buffName":"增益名","scope":"self","exclusive":false,"zones":[{"zoneId":"...","value":数值,"ref":null,"override":false}]}]}
2. buffName 用简短中文描述这条增益。
3. zones 只允许使用白名单内的 zoneId；无法归入任何白名单乘区的增益不要输出。
4. value：% 乘区直接填百分数数值（12 表示 +12%），flat 乘区填固定值数值。
5. 若增益数值是"按某属性百分比"（如攻击白值×50%），则该 zone 用 ref 表示：
   {"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"baseAtk","pct":50}}
   ref.targetZoneId 只能取引用乘区白名单；pct 为百分比数值（50 表示 50%）。有 ref 时 value 填 0。
6. 若文案中说明是"覆盖/替换"某乘区，给该 zone 加 "override": true。
7. 判断 scope：文案明确"全队/全体/队伍中"→ team；"除自身外/其他角色"→ self_except；"只在该效应/该角色/自身"→ self；"仅在某个具体效应/共鸣链存在时"→ effect_only 且 exclusive=true。
8. 命名规范：buff 名要一眼看懂，结构为：
   ①触发来源：如"散"（散华）、"菲专"（菲比专武）、"逆光2件"、"无归"（声骸）
   ②触发手段：如"E"、"长E"、"强E"
   ③受影响者：如"对自己"、"对全队"、"对下一位"、"对场上"
   ④层数：如"1层"、"2层"、"1阶"、"2阶"（建议追加在 buff 名最后便于归并）
   示例："散E对自己1层"、"菲专E对全队1层"、"逆光2件对场上1层"
   变体⑤：若上述结构无法清晰表达，直接用游戏原 buff 文案作为 buff 名。
   变体⑥：若游戏原文案不够一目了然，优化成玩家间的黑话。
9. 只输出 JSON，不要输出任何解释文字。

黑话词典（把官方/生僻叫法统一为玩家黑话，用于变体⑥）：
{SLANG_DICT}`

// 默认 user prompt 模板。占位符：{ENTITY_TYPE} {ENTITY_NAME} {INFO}
export const DEFAULT_USER_PROMPT_TEMPLATE = `实体类型：{ENTITY_TYPE}（{ENTITY_TYPE_RAW}）
实体名：{ENTITY_NAME}

以下是该实体的官方信息 JSON，请据此提取其所有可量化的增益，输出 Buff 集 JSON：
{INFO}`

// 默认黑话词典（"原叫法→黑话"，每行一条，用 "→" 分隔）
export const DEFAULT_SLANG_DICT = `光合能量→回路能量
喝彩→回路能量
星辉→回路能量`

export function renderSystemPrompt(template: string, slangDict: string): string {
    return template
        .replaceAll('{ZONE_LIST}', ZONE_LIST_TEXT)
        .replaceAll('{REF_ZONE_LIST}', REF_ZONE_LIST_TEXT)
        .replaceAll('{SLANG_DICT}', slangDict.trim() || DEFAULT_SLANG_DICT)
}

export interface RenderUserContext {
    entityType: string
    entityName: string
    info: unknown
}

export function renderUserPrompt(template: string, { entityType, entityName, info }: RenderUserContext): string {
    let infoText = ''
    try {
        infoText = JSON.stringify(info)
    } catch {
        infoText = String(info)
    }
    // 防止上下文过长，截断
    if (infoText.length > 12000) infoText = infoText.slice(0, 12000) + '…'

    const label = BUFF_ENTITY_LABELS[entityType as keyof typeof BUFF_ENTITY_LABELS] ?? entityType
    return template
        .replaceAll('{ENTITY_TYPE}', label)
        .replaceAll('{ENTITY_TYPE_RAW}', entityType)
        .replaceAll('{ENTITY_NAME}', entityName)
        .replaceAll('{INFO}', infoText)
}

// 供前端展示的 scope 标签映射（复用常量，避免重复）
export { BUFF_SCOPE_LABELS }
