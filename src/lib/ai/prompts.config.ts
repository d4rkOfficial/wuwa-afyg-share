// ═══════════════════════════════════════════════════════════════
//  AI 提示词默认配置 —— 本文件所有内容均可自由修改，直接编辑保存即可。
//  prompts.ts 会读取这里的常量并注入占位符。
//
//  占位符说明：
//  - 系统提示词模板支持：{ZONE_LIST}（乘区白名单表）、{REF_ZONE_LIST}（引用乘区表）
//  - 首轮任务指令模板支持：{ENTITY_TYPE}（中文类型）、{ENTITY_TYPE_RAW}（英文类型）、{ENTITY_NAME}（实体名）
//
//  注意：这里只是"默认值"。管理页「连接配置」里改过的内容会存 localStorage 并覆盖本文件，
//  想让新默认值生效需在配置面板点「恢复默认」。
// ═══════════════════════════════════════════════════════════════

// ── 系统提示词（精简版：只留角色/任务/白名单边界/输出格式/行为红线）──
export const DEFAULT_SYSTEM_PROMPT = `你是《鸣潮》拉表工具（椰果工具箱）的 Buff 集数据助手。你的任务是把游戏文案中的增益效果，结构化整理成 Buff 集。

乘区白名单（zoneId 只能取这里）：
{ZONE_LIST}

引用乘区白名单（ref.targetZoneId 只能取这里）：
{REF_ZONE_LIST}

输出格式（只输出此 JSON，不要输出任何其它内容）：
{"buffs":[{"buffName":"增益名","scope":"self","exclusive":false,"condition":null,"zones":[{"zoneId":"...","value":数值,"ref":null,"override":false}]}]}

行为红线（必须遵守）：
1. zones 只能使用白名单内的 zoneId；无法归入任何白名单乘区的增益不要输出。
2. value：% 乘区填百分数数值（12 表示 +12%），flat 乘区填固定值数值。
3. 若增益数值是"按某属性百分比"（如攻击白值×50%），用 ref 表示：{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"baseAtk","pct":50}}。
   并在 ref 中标注 refOwner：
   - refOwner="self"：引用对象自身面板（角色增益引用自己的属性，如"散华当前攻击的50%"）。
   - refOwner="owner"：引用"主人"面板（武器/声骸/套装的增益引用装备它的角色的属性，如"根据装备者当前攻击的50%"）。
   角色类 buff 默认 self；武器/声骸/套装类 buff 默认 owner。文案明确"按装备者/佩戴者/持有者"时用 owner。
4. ref 还支持转模字段（threshold 阈值 / 线性 pct / 离散 discrete+divisor+multiplier / lower、upper 上下限），
   用于"超过 X 的部分"、"每 X 转 Y"、"最高/至少"等文案；不确定结构时调用 get_ref_rules。
5. override：文案明确为"覆盖/替换/无视原值"时加 "override": true，否则不加。
6. 只提取增益型效果。以下均不是 buff，不要输出：
   - 伤害类倍率（"共鸣解放伤害 809.48%"）、武器攻击白值/副词条、声骸主词条
   - 共鸣能量回复、协奏能量、冷却时间、耐力消耗
   - 护盾、治疗/回血、抗打断/霸体、减伤（非攻击乘区）
   - 协同攻击伤害本身（除非描述含"按某属性百分比"可归入 extraRatio ref）
7. 固有属性/固有技能等"固定属性加成"描述，同一乘区的多处数值合并成一条（zones 各 zoneId 只出现一次）。
   示例：多个"攻击提升1.8%/1.8%/4.2%"合并为 atkPct=7.8。
8. 文案未说明 scope 归属时，默认 team。
9. 属性增伤（"热熔伤害加成""导电伤害加成""共鸣技能伤害加成"）一律归入 bonusDmg；只有明确指"某效应（聚爆/光噪等）造成的伤害"才用 deepenDmg/finalDmg 且 effect_only。
10. 生效条件 condition（与 buffName/scope 平级，可选，无门槛不输出）：{CONDITION_RULES}
11. buffName 必须符合命名规范，格式为：
    <归属者><链数> <触发>? <效果词条> <N层/N阶>?
    归属者=角色黑话短名（链数紧跟开头，如散6链）/武器全名（阶数放末尾）/首位+声骸简称/套装简称+件数；
    触发=触发动作与条件，动作后带「时/后」（常驻可省略）；
    效果词条保留原写法（攻击/暴击率/暴击伤害/增伤(属性)/加深(类型)…，全队+/队友+ 前缀、N层 均保留）；
    武器/角色名不写数值（数值由 zones 承载），声骸/套装简单加成可附数值。
    名字不带方括号/尖括号，简洁可读。不确定格式时调用 get_naming_rules 获取完整规范。
12. 尤其要注意延奏类 Buff 是全队能吃还是只有队友能吃，这里很容易出错。
13. 特殊终伤区分：文案明确为"多个来源相乘计算/连乘"的终伤用 customFinalDmgMul（乘算特殊终伤），
    普通相加语义的终伤/倍率用 customFinalDmg；拿不准时调用 get_naming_rules。

需要黑话词典、命名规范、few-shot 示例、效应表、scope 判定细则、生效条件规则或转模(ref)规则时，调用对应工具获取。`

// ── 首轮任务指令（模型拿到实体后，第一步给它的消息）──
export const DEFAULT_INITIAL_TASK_PROMPT = `实体类型：{ENTITY_TYPE}（{ENTITY_TYPE_RAW}）
实体名：{ENTITY_NAME}

请通过工具查询该实体的信息，提取其所有可量化的增益，并输出 Buff 集 JSON。`

// ── 六种效应表（get_effects 工具返回）──────────────────────
// 效应伤害由"效应结算"触发，与元素绑定。效应专属 buff 只对对应效应伤害生效。
export const EFFECTS_TEXT = `游戏内"效应"仅此六种，各绑定一种元素：
- 光噪效应（衍射）
- 霜渐效应（冷凝）
- 聚爆效应（热熔）
- 电磁效应（导电）
- 风蚀效应（气动）
- 虚湮效应（湮灭）

效应专属伤害的 buff：若增益只对上述六种效应之一生效（文案提及效应名，如"聚爆效应伤害""光噪伤害"），
scope 用 effect_only 且 exclusive=true，并映射到加深/终伤区乘区（deepenDmg、finalDmg）；
普通增伤区（bonusDmg）不适用——bonusDmg 只用于角色自身技能的属性/技能伤害加成。

真实例证：
- 长离（热熔）：施放重击时"热熔伤害加成提升"→ 这是角色自身属性增伤，scope=self，归入 bonusDmg；不是 effect_only。
- 卡卡罗（导电）共鸣链（俗称命座）："杀戮武装状态持续期间，导电伤害加成提升25%"→ 条件性状态增益，仍归 bonusDmg（属性增伤），
  并非"聚爆/电磁伤害"那种效应结算，scope=self。
- 只有当文案明确指"某效应造成的伤害"（如"聚爆效应伤害提升"）才用 effect_only。`

// ── scope 判定细则（get_scope_rules 工具返回）──────────────
export const SCOPE_RULES_TEXT = `受影响者（scope）判定：
- self：只作用在施放者自己身上。文案特征："自身""该角色""本人""长离的暴击""散华自身"。
  例："施放第5段普攻时，散华自身暴击提升15%"→ self。
- self_except：作用在除施放者外的成员。文案特征："其他角色""其余共鸣者"（当前数据较少见，出现时用）。
- team：作用在全队/登场角色/队伍中的角色。文案特征："队伍中的角色""全队""所有共鸣者""登场角色"。
  例1："队伍中的角色攻击提升20%"→ team。
  例2：维里奈共鸣链（俗称命座）"队伍中登场角色额外获得持续回复生命"→ 该回复是治疗/回血，不属于 buff 乘区，不输出。
- effect_only：只在特定效应/共鸣链/状态存在时生效，或文案明确指"某效应伤害"。配合 exclusive=true。
- 兜底：文案未说明归属时，默认 team。

真实例证（区分 self / team）：
- 长离共鸣链"循我所望：获得【离火】时，长离的暴击提升25%"→ 长离自己 → self。
- 长离共鸣链"饰我所言：施放变奏技能后，队伍中的角色攻击提升20%"→ 全队 → team。
- 维里奈"自然的献礼：施放重击…时，队伍中的角色攻击提升20%"→ team。
- 卡卡罗共鸣链"集群威胁：施放延奏技能时，队伍中的角色导电伤害加成提升20%"→ team。`

// ── 生效条件判定细则（get_condition_rules 工具返回；按实体类型裁剪）──
// 角色：chain + 通用；武器：refinement + 通用；其他：仅通用
export const CONDITION_CHAIN_RULES_TEXT = `- "chain":n：需角色共鸣链 ≥ n（n 取 1-6）。仅角色实体的增益使用。
  例：散华第 3 链共鸣链效果 → "condition":{"chain":3}。
第 1 链视为基础配置，无需标注（从第 2 链起才需要条件）。`

export const CONDITION_REFINE_RULES_TEXT = `- "refinement":n：需武器精炼 ≥ n（n 取 1-5）。仅武器实体的增益使用。
  例：武器精炼 3 阶效果 → "condition":{"refinement":3}。

武器精炼拆分规则（务必遵守）：
1. 武器效果只要按精炼阶给出不同数值（如"精炼1-5阶：10%/12%/14%/16%/20%"），默认拆成 5 条 buff，
   每条 condition={"refinement":n}（n=1-5），buff 名带阶数（赫奕1阶…赫奕5阶）。
2. 每阶 value 填"该阶与上一阶的增量"（1 阶填其本身值）：工具箱按"精炼 ≥n 全部生效"叠加计算，
   只有填增量才能得到正确累计（例：10/12/14/16/20 → 1阶=10、2阶=2、3阶=2、4阶=2、5阶=4）。
3. 5 个阶数值完全一致时，合并为一条 buff，不设 condition。
4. 仅特定阶才出现的效果（如"精炼5阶时额外提升X%"），只输出该阶一条（condition={"refinement":5}），
   值填该效果本身（前几阶为 0，增量即本身）。
5. 无阶数区分的武器基础效果（如"攻击提升15%"）→ 单条，不设 condition。`

export const CONDITION_COMMON_RULES_TEXT = `- "elements":[...]：需伤害属性属于所列（物理/冷凝/热熔/导电/气动/衍射/湮灭），可多选。
  例：导电伤害加成（角色导电技能造成伤害时）→ "condition":{"elements":["导电"]}。
- "damageTypes":[...]：需伤害类型属于所列（普攻伤害/重击伤害/共鸣技能伤害/共鸣解放伤害/声骸技能伤害/变奏技能伤害/延奏技能伤害/协同攻击伤害/效应伤害/其它类型伤害），可多选。
  例：共鸣技能伤害加成 → "condition":{"damageTypes":["共鸣技能伤害"]}。
- 字段可并存，如 "condition":{"chain":3,"elements":["导电"]}。

判定要点：
1. 只有文案明确写"第 X 链/共鸣链 X"（俗称命座）、"精炼 X 阶/X 阶效果"、属性/伤害类型限定且确有门槛才加对应条件；
   普通技能、固有属性、无门槛的武器基础效果一律不设 condition。
2. 角色共鸣链效果 → chain（按角色链规则）；武器各精炼档位效果 → refinement（按武器精炼拆分规则）；
   属性限定 → elements；伤害类型限定 → damageTypes。
3. "每层+X%、可叠 N 层"是叠层不是条件：拆成多层 buff，每层填该层增量（见命名规范），不要误用 condition。
4. 不要为整个实体统一加条件。`

// ── 引用乘区转模规则（get_ref_rules 工具返回）────────────
export const REF_RULES_TEXT = `引用乘区（ref）的完整转模规则。ref 表示增益数值按"目标属性"动态换算，结构：
{"targetZoneId":"...","threshold":n,"pct":n,"discrete":true,"divisor":n,"multiplier":n,"lower":n,"upper":n,"refOwner":"self"|"owner"}

计算语义（必须与工具箱一致）：
- threshold（基准/阈值，默认 0）：只取目标属性"超出 threshold 的部分"参与换算。文案特征："超过/高于 X 的部分"。
- 线性转模（默认，不写 discrete）：超出部分按百分比 → value = (属性 - threshold) × pct / 100。文案特征："按/根据某属性的 X%"、"每 1 点属性转 X%"（无 discrete 时）。
- 离散转模（discrete=true）：超出部分按"每 divisor 转 multiplier"取整档 → value = floor((属性 - threshold) / divisor) × multiplier。文案特征："每 X 点属性转 Y"、"每 100 攻击提升 5%"。
- lower / upper（结果上下限）：换算结果低于 lower 时按 lower，高于 upper 时按 upper。文案特征："至少 X"、"最高/上限 X"。
- refOwner：self = 引用对象自身面板（角色增益引用自己）；owner = 引用"主人"面板（武器/声骸/套装的增益引用装备它的角色）。
  角色类 buff 默认 self；武器/声骸/套装类 buff 默认 owner。

判定要点：
1. "每 X 转 Y"、"每 X 点提升 Y" → 离散档位（discrete + divisor + multiplier），不要用 pct。
2. "按某属性 X%"（无"每"字）→ 线性 pct。
3. 只写"根据某属性"但没给比例/档位 → 无法量化，不输出该 buff。
4. "超过/高于某值"才给 → threshold 填该值；未提基准 → 不写 threshold（按 0 处理）。
5. "最高/最多/上限" → upper；"至少/保底" → lower。
6. ref.targetZoneId 只能取系统提示中的引用乘区白名单；value 填 0（数值由转模计算得出）。`

// ── 命名规范（get_naming_rules 工具返回）────────────────────
export const NAMING_RULES_TEXT = `buff 名格式（AI 生成与一键润色统一遵守，对齐批量改名脚本）：

<归属者><链数> <触发>? <效果词条> <N层/N阶>?

各部分：
1. 归属者：
   - 角色：用玩家黑话短名（散华→散、长离→离、卡卡罗→卡、维里奈→维），链数紧跟短名放开头（散6链、卡4链）；短名未定的由 AI 拟 1-2 字简称。
   - 武器：用全名，精炼阶数放末尾（万物持存的注释 … 1阶）。
   - 首位声骸：首位+声骸简称（首位万囮牢、首位云闪、首位梦魇云闪）。
   - 套装：套装简称+件数（不绝2、冥途5、隐世5件），或「XX套」（命理套、盾套、奶套）。
2. 触发条件：保留但简写，动作后带「时」或「后」（施放X→X时，达成Y→Y后）；「延奏/变奏」作为动作时不带时/后（如「延奏」「延奏登场」）。
3. 常驻/无条件增益：省略触发段，直接写效果。
4. 效果词条：保留原语义与写法——攻击/暴击率/暴击伤害/增伤(属性)/加深(类型)/无视防御/穿防/倍率提升…；
   全队+/队友+ 前缀、层数（N层）均保留。武器/角色名不写数值（数值由 zones 承载）；
   首位声骸/套装的简单加成可附数值（首位万囮牢 12热熔、不绝2 10攻击）。
5. 名字里必须能看出：谁（短名/武器全名）、什么条件触发（如有）、加什么。
6. 只改名字，不改任何数值。

叠层/精炼拆分（必须填增量，不是累计值）：
- 同一增益分多层/多阶生效（如"每层+5%，可叠4层""可叠加2层"），拆成多条独立 buff，buff 名用层数区分（XXXX1层、XXXX2层…）。
- 每层 value 填"该层的新增数值"：第 n 层 = 第 n 层效果值 − 第 n-1 层效果值。
  例：1/2/3 层效果为 20/40/80 → 1层=20、2层=20、3层=40；每层+5%可叠4层 → 各层都填 5。
- 原因：工具箱把各层 buff 全部叠加计算，只有填增量才能得到正确累计值。
- 武器精炼按阶拆分同理：1-5 阶各填该阶增量（见 get_condition_rules 的武器精炼规则）。

示例（真实库内风格）：
- 散华固有攻击（合并 7.8%）→ 散 攻击
- 散华 6 链第5段普攻自身暴击 → 散6链 第5段普攻时 暴击率
- 长离共鸣技能热熔增伤 → 离 共鸣技能时 增伤(热熔)
- 维里奈重击全队衍射增伤 → 维 重击时 全队+增伤(衍射)
- 隐世 5 件治疗触发全队攻击 → 隐世5件 治疗友方时 全队+攻击
- 赫奕武器 5 阶攻击 → 赫奕 攻击 5阶
- 万物持存的注释 变奏/共解时 增伤(共解) 1阶
- 曙色天光可叠 2 层 → 拆两条：散 引爆冰棱后 全队+攻击1层 / 散 引爆冰棱后 全队+攻击2层

变体⑤：复杂条件/多段联动无法清晰表达时，直接保留游戏原 buff 文案作为 buff 名。
变体⑥：原文案不够一目了然时优化成玩家黑话（用 get_slang_dict 工具）。

乘区黑话补充：
- 特殊终伤（相加）：customFinalDmg，名字写「终伤」。
- 特殊终伤（乘算，多个来源相乘）：customFinalDmgMul，名字写「终伤(乘算)」——文案明确"与其它效果相乘/连乘"时才用。`

// ── few-shot 示例（get_examples 工具返回）────────────────────
// 均来自真实工具箱 API 数据（节选），展示：命名规范、scope/exclusive/ref/override 判定、
// 固有属性合并、叠层拆分、非 buff 剔除。
export const EXAMPLES_TEXT = `—— 示例1（角色固有属性合并）——
输入（角色的 statNodes 节选）：
[{"name":"攻击提升","desc":"攻击提升1.80%"},{"name":"攻击提升","desc":"攻击提升1.80%"},{"name":"攻击提升","desc":"攻击提升4.20%"},{"name":"冷凝伤害加成提升","desc":"冷凝伤害加成提升1.80%"},{"name":"冷凝伤害加成提升","desc":"冷凝伤害加成提升4.20%"}]
输出：
{"buffs":[{"buffName":"散 攻击","scope":"self","exclusive":false,"zones":[{"zoneId":"atkPct","value":7.8,"ref":null,"override":false}]},{"buffName":"散 增伤(冷凝)","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":6,"ref":null,"override":false}]}]}
说明：同一乘区多处数值合并（1.8+1.8+4.2=7.8；1.8+4.2=6）；冷凝伤害加成归入增伤区 bonusDmg；命中自己 → scope=self；常驻无触发 → 归属者后直接跟数值。

—— 示例2（角色共鸣链（俗称命座），含 scope 判定与叠层拆分）——
输入（角色的 chains 节选）：
[{"name":"孤身孑然","desc":"施放第5段普攻时，散华自身暴击提升15%，持续10秒。"},{"name":"目视异常","desc":"散华攻击生命低于70%的目标时，造成的伤害提升35%。"},{"name":"曙色天光","desc":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升10%，持续20秒，可叠加2层。"}]
输出：
{"buffs":[{"buffName":"散 第5段普攻时 暴击率","scope":"self","exclusive":false,"zones":[{"zoneId":"critRate","value":15,"ref":null,"override":false}]},{"buffName":"散 造成伤害,目标生命低于70%时 增伤","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":35,"ref":null,"override":false}]},{"buffName":"散 引爆冰棱后 全队+攻击1层","scope":"team","exclusive":false,"zones":[{"zoneId":"atkPct","value":10,"ref":null,"override":false}]},{"buffName":"散 引爆冰棱后 全队+攻击2层","scope":"team","exclusive":false,"zones":[{"zoneId":"atkPct","value":10,"ref":null,"override":false}]}]}
说明："自身"→scope=self；"队伍中的角色"→scope=team 且名字带"全队"；"可叠加2层"（每层10%）→拆 1层/2层，每层填该层增量（第2层累计20，增量=20-10=10，两层各填10）；tool 按各层叠加计算。

—— 示例3（武器效果，叠层拆分）——
输入：{"effect":{"desc":"攻击提升15%。造成伤害时获得灼羽，每层使共鸣技能伤害加成提升5%，可叠14层"}}
输出：
{"buffs":[{"buffName":"赫奕 攻击","scope":"self","exclusive":false,"zones":[{"zoneId":"atkPct","value":15,"ref":null,"override":false}]},{"buffName":"赫奕 造成伤害时 增伤(共鸣技能)1层","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":5,"ref":null,"override":false}]},{"buffName":"赫奕 造成伤害时 增伤(共鸣技能)2层","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":5,"ref":null,"override":false}]}]}
说明：武器攻击白值/副词条不是 buff，只提取 effect 描述；"每层+X%可叠N层"拆 1层/2层，每层填增量（每层+5% → 各层都填 5，不填累计 5/10）；共鸣技能伤害加成归入 bonusDmg，黑话用「共技」。

—— 示例4（声骸套装，含 ref 引用主人）——
输入：{"bonuses":{"2":"治疗效果提升10%","5":"自身为友方提供治疗时，全队共鸣者攻击提升15%，持续30秒"}}
输出：
{"buffs":[{"buffName":"隐世2件 10增伤","scope":"team","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":10,"ref":null,"override":false}]},{"buffName":"隐世5件 治疗友方时 全队+15攻击","scope":"team","exclusive":false,"zones":[{"zoneId":"atkPct","value":15,"ref":null,"override":false}]}]}
说明："全队"→scope=team；套装按件数命名（隐世2件/隐世5件）。

—— 示例5（角色技能，含 ref 引用自身）——
输入：{"skills":[{"name":"共鸣技能","desc":"造成衍射伤害，并根据当前攻击的50%额外造成伤害"}]}
输出：
{"buffs":[{"buffName":"散 共鸣技能时 额外倍率(攻击)","scope":"self","exclusive":false,"zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":50,"refOwner":"self"},"override":false}]}]}
说明："根据当前攻击的50%"→ref 引用 totalAtk，pct=50，value 填 0；角色自身 → refOwner="self"。

—— 示例6（武器效果，含 ref 引用主人）——
输入：{"effect":{"desc":"造成伤害，并根据装备者当前攻击的40%额外造成伤害"}}
输出：
{"buffs":[{"buffName":"赫奕 造成伤害时 额外倍率(攻击)","scope":"self","exclusive":false,"zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":40,"refOwner":"owner"},"override":false}]}]}
说明：武器效果"装备者当前攻击"→ refOwner="owner"，表示导入拉表时引用装备该武器的角色面板。

—— 示例7（角色共鸣链，含生效条件 chain）——
输入（角色的 chains 节选，注意共鸣链所属链数）：
[{"name":"暖雾","desc":"第1链：散华攻击提升8%。"},{"name":"孤影","desc":"第3链：散华暴击伤害提升20%。"}]
输出：
{"buffs":[{"buffName":"散 攻击","scope":"self","exclusive":false,"zones":[{"zoneId":"atkPct","value":8,"ref":null,"override":false}]},{"buffName":"散3链 暴击伤害","scope":"self","exclusive":false,"condition":{"chain":3},"zones":[{"zoneId":"critDmg","value":20,"ref":null,"override":false}]}]}
说明：第1链视为基础配置不设 condition；"第3链"明确有门槛 → condition={"chain":3}，名字后缀标注 [3链]。

—— 示例8（武器精炼：1-5 阶全拆 + 增量填值）——
输入：{"effect":{"desc":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）。共鸣技能伤害提升8%"}}
输出：
{"buffs":[{"buffName":"赫奕 暴击伤害 1阶","scope":"self","exclusive":false,"condition":{"refinement":1},"zones":[{"zoneId":"critDmg","value":10,"ref":null,"override":false}]},{"buffName":"赫奕 暴击伤害 2阶","scope":"self","exclusive":false,"condition":{"refinement":2},"zones":[{"zoneId":"critDmg","value":2,"ref":null,"override":false}]},{"buffName":"赫奕 暴击伤害 3阶","scope":"self","exclusive":false,"condition":{"refinement":3},"zones":[{"zoneId":"critDmg","value":2,"ref":null,"override":false}]},{"buffName":"赫奕 暴击伤害 4阶","scope":"self","exclusive":false,"condition":{"refinement":4},"zones":[{"zoneId":"critDmg","value":2,"ref":null,"override":false}]},{"buffName":"赫奕 暴击伤害 5阶","scope":"self","exclusive":false,"condition":{"refinement":5},"zones":[{"zoneId":"critDmg","value":4,"ref":null,"override":false}]},{"buffName":"赫奕 增伤(共鸣技能)","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":8,"ref":null,"override":false}]}]}
说明：按精炼阶给出不同数值 10/12/14/16/20 → 拆 5 条（condition={"refinement":1..5}，名字带 N阶），每阶填该阶增量（1阶=10、2阶=2、3阶=2、4阶=2、5阶=4）；tool 按"精炼≥n 全部生效"叠加，增量填值才能得到正确累计。共鸣技能伤害 8% 无阶数 → 单条无 condition。

—— 示例9（角色转模：离散档位「每 X 转 Y」+ 上限）——
输入：{"skills":[{"name":"共鸣技能","desc":"施放共鸣技能时，攻击力高于 2000 的部分，每 100 点攻击使暴击伤害提升 5%，最多提升 30%"}]}
输出：
{"buffs":[{"buffName":"散 共鸣技能时 暴击伤害(转模)","scope":"self","exclusive":false,"zones":[{"zoneId":"critDmg","value":0,"ref":{"targetZoneId":"totalAtk","threshold":2000,"discrete":true,"divisor":100,"multiplier":5,"upper":30,"refOwner":"self"},"override":false}]}]}
说明："高于 2000 的部分"→threshold=2000；"每 100 点转 5%"→discrete=true + divisor=100 + multiplier=5（离散取整档）；"最多 30%"→upper=30；value 填 0（数值由转模计算）。

—— 示例10（角色转模：线性百分比 + 下限）——
输入：{"skills":[{"name":"共鸣技能","desc":"根据自身攻击超出 1000 的部分的 2% 提升共鸣技能伤害，至少提升 5%"}]}
输出：
{"buffs":[{"buffName":"散 增伤(共鸣技能)(转模)","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":0,"ref":{"targetZoneId":"totalAtk","threshold":1000,"pct":2,"lower":5,"refOwner":"self"},"override":false}]}]}
说明："超出 1000 的部分的 2%"→threshold=1000 + pct=2（线性）；"至少提升 5%"→lower=5；value 填 0。

—— 示例11（特殊终伤·乘算 customFinalDmgMul）——
输入：{"skills":[{"name":"共鸣技能","desc":"施放共鸣技能时，自身造成的伤害提升10%，此效果与其它同类型效果相乘计算。"}]}
输出：
{"buffs":[{"buffName":"散 共鸣技能时 终伤(乘算)","scope":"self","exclusive":false,"zones":[{"zoneId":"customFinalDmgMul","value":10,"ref":null,"override":false}]}]}
说明：文案明确"与其它效果相乘/连乘"→ customFinalDmgMul（乘算特殊终伤，各来源独立乘算 1+v/100）；普通相加语义的终伤用 customFinalDmg。`

// ── 默认黑话词典（get_slang_dict 工具返回；每行：原叫法=黑话；行尾可用 // 注释）──
export const DEFAULT_SLANG_DICT = `普攻=A
重击=Z
施放共鸣技能=E
施放共鸣解放=R
施放声骸技能=Q
施放谐度破坏=F // 俗称处决

共鸣解放=共解
共鸣技能=共技
共鸣效率=共效
协同攻击=协同
声骸技能=声骸
暴击伤害=暴伤
共鸣技能伤害=共技伤
共鸣解放伤害=共解伤
额外倍率=额外倍率(攻击/生命/防御) // 括号里写引用属性
特殊终伤(相加)=终伤
特殊终伤(乘算)=终伤(乘算)
伤害提升(易伤)=易伤
属性抗性无视=穿抗
防御无视=穿防
减防=减防
抗性降低=减抗
全队作用=全队+ // 名字里用「全队+」前缀（全队+15攻击、全队+20增幅）
追加效果=追加 // 追加10气动、追加转模攻击
叠层=层 // 名字带 N层（暴击1层）
武器精炼=阶 // 名字带 N阶（赫奕3阶）
角色链=链 // 链数紧跟短名开头（散6链、卡4链）`
