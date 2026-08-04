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
{"buffs":[{"buffName":"增益名","scope":"self","exclusive":false,"zones":[{"zoneId":"...","value":数值,"ref":null,"override":false}]}]}

行为红线（必须遵守）：
1. zones 只能使用白名单内的 zoneId；无法归入任何白名单乘区的增益不要输出。
2. value：% 乘区填百分数数值（12 表示 +12%），flat 乘区填固定值数值。
3. 若增益数值是"按某属性百分比"（如攻击白值×50%），用 ref 表示：{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"baseAtk","pct":50}}。
   并在 ref 中标注 refOwner：
   - refOwner="self"：引用对象自身面板（角色增益引用自己的属性，如"散华当前攻击的50%"）。
   - refOwner="owner"：引用"主人"面板（武器/声骸/套装的增益引用装备它的角色的属性，如"根据装备者当前攻击的50%"）。
   角色类 buff 默认 self；武器/声骸/套装类 buff 默认 owner。文案明确"按装备者/佩戴者/持有者"时用 owner。
4. override：文案明确为"覆盖/替换/无视原值"时加 "override": true，否则不加。
5. 只提取增益型效果。以下均不是 buff，不要输出：
   - 伤害类倍率（"共鸣解放伤害 809.48%"）、武器攻击白值/副词条、声骸主词条
   - 共鸣能量回复、协奏能量、冷却时间、耐力消耗
   - 护盾、治疗/回血、抗打断/霸体、减伤（非攻击乘区）
   - 协同攻击伤害本身（除非描述含"按某属性百分比"可归入 extraRatio ref）
6. 固有属性/固有技能等"固定属性加成"描述，同一乘区的多处数值合并成一条（zones 各 zoneId 只出现一次）。
   示例：多个"攻击提升1.8%/1.8%/4.2%"合并为 atkPct=7.8。
7. 文案未说明 scope 归属时，默认 team。
8. 属性增伤（"热熔伤害加成""导电伤害加成""共鸣技能伤害加成"）一律归入 bonusDmg；只有明确指"某效应（聚爆/光噪等）造成的伤害"才用 deepenDmg/finalDmg 且 effect_only。

需要黑话词典、命名规范、few-shot 示例、效应表或 scope 判定细则时，调用对应工具获取。`

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
- 卡卡罗（导电）命座："杀戮武装状态持续期间，导电伤害加成提升25%"→ 条件性状态增益，仍归 bonusDmg（属性增伤），
  并非"聚爆/电磁伤害"那种效应结算，scope=self。
- 只有当文案明确指"某效应造成的伤害"（如"聚爆效应伤害提升"）才用 effect_only。`

// ── scope 判定细则（get_scope_rules 工具返回）──────────────
export const SCOPE_RULES_TEXT = `受影响者（scope）判定：
- self：只作用在施放者自己身上。文案特征："自身""该角色""本人""长离的暴击""散华自身"。
  例："施放第5段普攻时，散华自身暴击提升15%"→ self。
- self_except：作用在除施放者外的成员。文案特征："其他角色""其余共鸣者"（当前数据较少见，出现时用）。
- team：作用在全队/登场角色/队伍中的角色。文案特征："队伍中的角色""全队""所有共鸣者""登场角色"。
  例1："队伍中的角色攻击提升20%"→ team。
  例2：维里奈命座"队伍中登场角色额外获得持续回复生命"→ 该回复是治疗/回血，不属于 buff 乘区，不输出。
- effect_only：只在特定效应/共鸣链/状态存在时生效，或文案明确指"某效应伤害"。配合 exclusive=true。
- 兜底：文案未说明归属时，默认 team。

真实例证（区分 self / team）：
- 长离命座"循我所望：获得【离火】时，长离的暴击提升25%"→ 长离自己 → self。
- 长离命座"饰我所言：施放变奏技能后，队伍中的角色攻击提升20%"→ 全队 → team。
- 维里奈"自然的献礼：施放重击…时，队伍中的角色攻击提升20%"→ team。
- 卡卡罗命座"集群威胁：施放延奏技能时，队伍中的角色导电伤害加成提升20%"→ team。`

// ── 命名规范（get_naming_rules 工具返回）────────────────────
export const NAMING_RULES_TEXT = `buff 名要一眼看懂，结构 = 触发来源 + 触发手段 + 层数：

① 触发来源：用玩家熟知的简称，而不是完整长名。规则：
   - 角色用其名字尾字或通用黑话：散华→"散"、长离→"离"、卡卡罗→"卡"、维里奈→"维"（来源名可在黑话词典补充）。
   - 武器用效果名或简称：赫奕流明→"赫奕"；若效果有独立名字如【灼羽】，用效果名。
   - 声骸套装按件数：隐世回光→"隐世2件"、"隐世5件"；逆光→"逆光2件"。
② 触发手段：用按键/动作黑话（见黑话词典）：普攻=A、重击=E、共鸣技能=E、共鸣解放=R、声骸技能=Q、谐度破坏=F。
   需要区分手段差异时用"长E""强E"等。
③ 层数：如"1层""2层""1阶""2阶"，追加在 buff 名最后便于归并。
示例："散E1层"（散华共鸣技能）、"离E1层"（长离共鸣技能）、"卡R1层"（卡卡罗共鸣解放）、"隐世2件1层"。

命名组合示例（真实数据）：
- 散华固有属性 → "散固有1层"
- 散华命座"孤身孑然"（自身暴击）→ "散孤身1层"
- 长离命座"循我所望"（自身暴击25%）→ "离循我所望1层"
- 维里奈命座"盛放的拥抱"（队伍衍射增伤）→ "维盛放1层"

叠层拆分：同一增益分多层/多阶生效（如"每层+5%，可叠4层""1阶/2阶/3阶效果""可叠加2层"），
  必须拆成多条独立 buff，buff 名用层数区分：XXXX 1层、XXXX 2层…每层填该层累计数值，不要合并。
  例：卡卡罗无叠层（各命座独立）；曙色天光"可叠加2层"→ 曙色天光1层(atkPct 10) + 曙色天光2层(atkPct 20)。

变体⑤：上述结构无法清晰表达时（如复杂条件/多段联动），直接用游戏原 buff 文案作为 buff 名。
变体⑥：游戏原文案不够一目了然时，优化成玩家间的黑话（用 get_slang_dict 工具）。`

// ── few-shot 示例（get_examples 工具返回）────────────────────
// 均来自真实工具箱 API 数据（节选），展示：命名规范、scope/exclusive/ref/override 判定、
// 固有属性合并、叠层拆分、非 buff 剔除。
export const EXAMPLES_TEXT = `—— 示例1（角色固有属性合并）——
输入（角色的 statNodes 节选）：
[{"name":"攻击提升","desc":"攻击提升1.80%"},{"name":"攻击提升","desc":"攻击提升1.80%"},{"name":"攻击提升","desc":"攻击提升4.20%"},{"name":"冷凝伤害加成提升","desc":"冷凝伤害加成提升1.80%"},{"name":"冷凝伤害加成提升","desc":"冷凝伤害加成提升4.20%"}]
输出：
{"buffs":[{"buffName":"固有攻击1层","scope":"self","exclusive":false,"zones":[{"zoneId":"atkPct","value":7.8,"ref":null,"override":false}]},{"buffName":"固有冷凝1层","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":6,"ref":null,"override":false}]}]}
说明：同一乘区多处数值合并（1.8+1.8+4.2=7.8；1.8+4.2=6）；冷凝伤害加成归入增伤区 bonusDmg；命中自己 → scope=self。

—— 示例2（角色命座，含 scope 判定）——
输入（角色的 chains 节选）：
[{"name":"孤身孑然","desc":"施放第5段普攻时，散华自身暴击提升15%，持续10秒。"},{"name":"目视异常","desc":"散华攻击生命低于70%的目标时，造成的伤害提升35%。"},{"name":"曙色天光","desc":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升10%，持续20秒，可叠加2层。"}]
输出：
{"buffs":[{"buffName":"孤身孑然1层","scope":"self","exclusive":false,"zones":[{"zoneId":"critRate","value":15,"ref":null,"override":false}]},{"buffName":"目视异常1层","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":35,"ref":null,"override":false}]},{"buffName":"曙色天光1层","scope":"team","exclusive":false,"zones":[{"zoneId":"atkPct","value":10,"ref":null,"override":false}]},{"buffName":"曙色天光2层","scope":"team","exclusive":false,"zones":[{"zoneId":"atkPct","value":20,"ref":null,"override":false}]}]}
说明："自身"→scope=self；"队伍中的角色"→scope=team；"可叠加2层"→拆成 1层/2层 两条。

—— 示例3（武器效果，叠层拆分）——
输入：{"effect":{"desc":"攻击提升15%。造成伤害时获得灼羽，每层使共鸣技能伤害加成提升5%，可叠14层"}}
输出：
{"buffs":[{"buffName":"武器1层","scope":"self","exclusive":false,"zones":[{"zoneId":"atkPct","value":15,"ref":null,"override":false}]},{"buffName":"武器灼羽1层","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":5,"ref":null,"override":false}]},{"buffName":"武器灼羽2层","scope":"self","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":10,"ref":null,"override":false}]}]}
说明：武器攻击白值/副词条不是 buff，只提取 effect 描述；"每层+X%可叠N层"拆 1层/2层；共鸣技能伤害加成归入 bonusDmg。

—— 示例4（声骸套装，含 ref 引用主人）——
输入：{"bonuses":{"2":"治疗效果提升10%","5":"自身为友方提供治疗时，全队共鸣者攻击提升15%，持续30秒"}}
输出：
{"buffs":[{"buffName":"隐世2件1层","scope":"team","exclusive":false,"zones":[{"zoneId":"bonusDmg","value":10,"ref":null,"override":false}]},{"buffName":"隐世5件1层","scope":"team","exclusive":false,"zones":[{"zoneId":"atkPct","value":15,"ref":null,"override":false}]}]}
说明："全队"→scope=team；套装加成按件数命名（2件/5件）。

—— 示例5（角色技能，含 ref 引用自身）——
输入：{"skills":[{"name":"共鸣技能","desc":"造成衍射伤害，并根据当前攻击的50%额外造成伤害"}]}
输出：
{"buffs":[{"buffName":"E1层","scope":"self","exclusive":false,"zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":50,"refOwner":"self"},"override":false}]}]}
说明："根据当前攻击的50%"→ref 引用 totalAtk，pct=50，value 填 0；角色自身 → refOwner="self"。

—— 示例6（武器效果，含 ref 引用主人）——
输入：{"effect":{"desc":"造成伤害，并根据装备者当前攻击的40%额外造成伤害"}}
输出：
{"buffs":[{"buffName":"武器1层","scope":"self","exclusive":false,"zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":40,"refOwner":"owner"},"override":false}]}]}
说明：武器效果"装备者当前攻击"→ refOwner="owner"，表示导入拉表时引用装备该武器的角色面板。`

// ── 默认黑话词典（get_slang_dict 工具返回；每行：原叫法=黑话；行尾可用 // 注释）──
export const DEFAULT_SLANG_DICT = `普攻=A
重击=Z
施放共鸣技能=E
施放共鸣解放=R
施放声骸技能=Q
施放谐度破坏=F // 俗称处决`
