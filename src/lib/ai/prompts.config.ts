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
{"buffs":[{"folder":"游戏原文案","buffName":"效果名+数值","scope":"self","exclusive":false,"condition":null,"zones":[{"zoneId":"...","value":数值,"ref":null,"override":false,"condition":null}]}]}

命名是**两段式**（这是本库最新命名风格，务必遵守）：
- folder = 游戏里那句原文（原文照抄，只去掉增益数值，保留「持续10秒 / 切人掉 / 可叠加」这类限定语）
- buffName = 效果名 + 数值；层数 / 武器阶数 / 共鸣链 用括号放末尾
- 完整全名即「原文案 \ 效果」（反斜杠由系统拼接，JSON 里**不要**自己写反斜杠，也不要把文件夹名塞进 buffName）
- 例：folder「施放共鸣技能时，暴击提升，持续10秒」+ buffName「暴击率15%」
- 例：folder「引爆【冰棱】或【冰川】后，队伍中的角色攻击提升，可叠加2层」+ buffName「攻击10%(2层)」
- 例：folder「暴击伤害提升（对应精炼1-5阶）」+ buffName「10%暴击伤害」…「20%暴击伤害」（名字写原文数值，不写阶）
细节见 get_naming_rules。

行为红线（必须遵守）：
1. zones 只能使用白名单内的 zoneId；无法归入任何白名单乘区的增益不要输出。
2. value：% 乘区填百分数数值（12 表示 +12%），flat 乘区填固定值数值；层数类 flat 乘区（集谐干涉层数 tuneStrainLayer、同奏增益层数 unisonBoonLayer）填层数本身（如 +2 层 → value=2）。其中**集谐干涉层数只允许固定层数，不可配引用/转模，也不能作为引用目标**——它挂在**目标**身上、全队共用一份，不存在「某角色的集谐干涉层数」；同奏增益层数属于角色，可以配引用/转模、也可以作为引用来源（规则见第 3、4 条）。
3. 若增益数值是"按某属性百分比"（如攻击白值×50%），用 ref 表示：{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"baseAtk","pct":50}}。
   并在 ref 中标注 refOwner：
   - refOwner="self"：引用对象自身面板（角色增益引用自己的属性，如"散华当前攻击的50%"）。
   - refOwner="owner"：引用"主人"面板（武器/声骸/套装的增益引用装备它的角色的属性，如"根据装备者当前攻击的50%"）。
   - refOwner="active"：引用**出伤者**面板（本次伤害所属角色，如"根据造成伤害的角色当前攻击"）。
   角色类 buff 默认 self；武器/声骸/套装类 buff 默认 owner。文案明确"按装备者/佩戴者/持有者"时用 owner，
   明确"按造成伤害的角色/当前出伤角色"时用 active。
4. ref 还支持转模字段（threshold 阈值 / 线性 pct / 离散 discrete+divisor+multiplier / lower、upper 上下限），
   用于"超过 X 的部分"、"每 X 转 Y"、"最高/至少"等文案；不确定结构时调用 get_ref_rules。
   ref.targetZoneId 除属性外还可以取层数：unisonBoonLayer（同奏增益层数）——
   它是**按角色独立**的层数，读的是被引用角色自己累计的层数（集谐干涉层数不属于角色，不能作为引用目标）。
5. override：文案明确为"覆盖/替换/无视原值"时加 "override": true，否则不加。同一乘区内只允许一个覆盖条目。
6. 只提取增益型效果。以下均不是 buff，不要输出：
   - 技能自身的**基础倍率数字**（"共鸣解放伤害 809.48%" 这类原始倍率，本身不是增益）；
     但"额外造成 X% 攻击的伤害"属 「extraRatio」、"伤害倍率提升 X%" 属 「specialFinal1」，两者都要输出（见第 14 条）
   - 共鸣能量回复、协奏能量、冷却时间、耐力消耗
   - 护盾、治疗/回血、抗打断/霸体、减伤（非攻击乘区）
   - 协同攻击伤害本身（除非描述含"按某属性百分比"可归入 extraRatio ref）
7. 无条件的固定属性加成，同一乘区的多处数值合并成一条（zones 各 zoneId 只出现一次）。
   示例：多个"攻击提升1.8%/1.8%/4.2%"合并为 atkPct=7.8。
   但**同一乘区可以出现多次**：当同一乘区在不同生效条件（伤害类型 / 伤害属性）下数值不同时，
   拆成多条同 zoneId 条目，各自带上自己的乘区级 condition（见第 11 条）。
8. 文案未说明 scope 归属时，默认 team。
9. 属性增伤（"热熔伤害加成""导电伤害加成""共鸣技能伤害加成"）一律归入 bonusDmg；只有明确指"某效应（聚爆/光噪等）造成的伤害"才用 deepenDmg/finalDmg 且 effect_only。
10. Buff 实例级生效条件 condition（与 buffName/scope 平级，可选，无门槛不输出）：{CONDITION_RULES}
11. 乘区级生效条件（写在具体 zone 条目里，与 zoneId/value 平级，可选）：只允许
    "elements":[...]（伤害属性多选，类内或）与 "damageTypes":[...]（伤害类型多选，类内或），两者之间为且；
    链条件 / 阶条件**不可**挂在乘区上。例：{"zoneId":"bonusDmg","value":15,"condition":{"damageTypes":["共鸣技能伤害"]}}。
12. buffName 必须符合命名规范（两段式）：
    - folder：游戏原文案，原文照抄；**只去掉增益数值**，保留「持续10秒 / 切人掉 / 可叠加 / 每层」这类限定语义
    - buffName：「数值+效果名」，层/链用括号放末尾且必须带数值（10%攻击(2层)、15%暴击伤害(3链)）；
  武器精炼阶**不写进名字**（10%暴击伤害 / 12%暴击伤害…，阶由 condition 表达）
    - JSON 里不要写反斜杠，也不要把文件夹名塞进 buffName（系统会自动拼成「原文案 \ 效果」）
    完整规则与示例调用 get_naming_rules；绝不能自己拟黑话短名。
    **武器 buff 不要带武器名**（folder / buffName 都不写），实体本身已经限定了是哪把武器。
13. 尤其要注意延奏类 Buff 是全队能吃还是只有队友能吃，这里很容易出错。
14. **乘区归属判定表（按文案措辞判，不要按数值大小猜）**：
    - **含「加成」二字**（"热熔伤害加成"、"共鸣技能伤害加成"、"普攻伤害加成"）
      → 「bonusDmg」：**有「加成」必定是加成**。
    - **带属性 / 伤害类型的「伤害提升」**（"热熔伤害提升"、"共鸣技能伤害提升"）
      → 多半也是 「bonusDmg」，不要判成易伤。
    - **具名招式 / 倍率名** + 「伤害**倍率**提升 X%」（"普攻伤害倍率提升 30%"、"共鸣解放移岁诰邪伤害倍率提升 120%"）
      → 「specialFinal1」（特殊终伤：加算，1 + v/100）。游戏文案**不会**写"特殊终伤"这四个字。
      文案明确"与其它效果相乘 / 连乘" → 「specialFinal2」（∏(1 + v/100)）。
    - **具名招式 / 倍率名** + 「伤害提升 X%」（**没有**"倍率"二字，如"对目标造成的伤害提升 30%"、
      目标 / 敌人受到的伤害提升）→ 「dmgTakenInc」（易伤）。
    - **「额外造成一次…伤害 / 追加一段伤害 / 每段触发」**（新增一击）→ 「extraRatio」，
      值 = 那一击的攻击倍率（实测 100–1700）；按属性换算时走 ref（"根据造成伤害的角色当前攻击的 50% 额外造成伤害"）。
    - 「最终伤害提升 X%」→ 「finalDmg」；「造成的伤害加深」→ 「deepenDmg」。
    - 口诀：**「倍率提升」→ 特殊终伤；「伤害加成」→ 加成；具名招式的「伤害提升」→ 易伤；「额外造成…的伤害」→ 额外倍率**。
      拿不准时调用 get_naming_rules。

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
export const CONDITION_CHAIN_RULES_TEXT = `- "chains":[{"charIdx":0,"min":n}]：需角色共鸣链 ≥ n（n 取 0-6，0 表示角色本体/未点共鸣链）。仅角色实体的增益使用。
  charIdx **固定写 0**（工坊没有配队上下文；导入工具箱时会按实体真实归属重指）。为兼容旧数据，也可以直接写 "condition":{"chain":3}（等价于 charIdx=0）。
  例：散华第 3 链共鸣链效果 → "condition":{"chains":[{"charIdx":0,"min":3}]}。
  第 1 链视为基础配置，无需标注（从第 2 链起才需要条件）。
  链条件与阶条件**可以并存**：同一条 buff 同时受两者约束时两条都写。`

export const CONDITION_REFINE_RULES_TEXT = `- "refinements":[{"charIdx":0,"min":n}]：需武器精炼 ≥ n（n 取 1-5）。仅武器实体的增益使用。
  charIdx **固定写 0**（工坊没有配队上下文；导入工具箱时会按实体真实归属重指）。为兼容旧数据，也可以直接写 "condition":{"refinement":3}（等价于 charIdx=0）。
  例：武器精炼 3 阶效果 → "condition":{"refinements":[{"charIdx":0,"min":3}]}。
  链条件与阶条件**可以并存**：同一条 buff 同时受两者约束时两条都写。

武器精炼拆分规则（务必遵守）：
1. 武器效果只要按精炼阶给出不同数值（如"精炼1-5阶：10%/12%/14%/16%/20%"），默认拆成 5 条 buff，
   每条 condition={"refinements":[{"charIdx":0,"min":n}]}（n=1-5）；**buff 名不写阶**，
   只写「原文该阶数值 + 乘区」（如 10%暴击伤害 / 12%暴击伤害 …；相邻阶同值时合并成一条）。
2. 每阶 value 填"该阶与上一阶的增量"（1 阶填其本身值）：工具箱按"精炼 ≥n 全部生效"叠加计算，
   只有填增量才能得到正确累计（例：10/12/14/16/20 → 1阶=10、2阶=2、3阶=2、4阶=2、5阶=4）。
3. 5 个阶数值完全一致时，合并为一条 buff，不设 condition。
4. 仅特定阶才出现的效果（如"精炼5阶时额外提升X%"），只输出该阶一条（condition={"refinements":[{"charIdx":0,"min":5}]}），
   值填该效果本身（前几阶为 0，增量即本身）。
5. 无阶数区分的武器基础效果（如"攻击提升15%"）→ 单条，不设 condition。`

export const CONDITION_COMMON_RULES_TEXT = `生效条件分两层（与工具箱一致）：
① Buff 实例级（与 buffName/scope 平级）：链条件 / 阶条件（硬性门槛，可并存）+ 规则列表 rules；
② 乘区级（写在具体 zone 条目里）：只放伤害属性 / 伤害类型。

- 乘区级 "elements":[...]：需伤害属性属于所列（物理/冷凝/热熔/导电/气动/衍射/湮灭），可多选。
  例：导电伤害加成 → {"zoneId":"bonusDmg","value":15,"condition":{"elements":["导电"]}}。
- 乘区级 "damageTypes":[...]：需伤害类型属于所列（普攻伤害/重击伤害/共鸣技能伤害/共鸣解放伤害/声骸技能伤害/变奏技能伤害/延奏技能伤害/协同攻击伤害/效应伤害/其它类型伤害），可多选。
  例：共鸣技能伤害加成 → {"zoneId":"bonusDmg","value":15,"condition":{"damageTypes":["共鸣技能伤害"]}}。
- 同一乘区在不同条件下数值不同时，**写多条同 zoneId 的条目**，每条带自己的 condition。
  例：普攻伤害+10%、共鸣技能伤害+20% →
  "zones":[{"zoneId":"bonusDmg","value":10,"condition":{"damageTypes":["普攻伤害"]}},{"zoneId":"bonusDmg","value":20,"condition":{"damageTypes":["共鸣技能伤害"]}}]
- 乘区级条件里可同时写 elements 与 damageTypes（两者之间为"且"）。

判定要点：
1. 只有文案明确写"第 X 链/共鸣链 X"（俗称命座）、"精炼 X 阶/X 阶效果"、属性/伤害类型限定且确有门槛才加对应条件；
   普通技能、固有属性、无门槛的武器基础效果一律不设 condition。
2. 角色共鸣链效果 → 实例级 chains；武器各精炼档位效果 → 实例级 refinements；
   属性限定 → 乘区级 elements；伤害类型限定 → 乘区级 damageTypes。
3. "每层+X%、可叠 N 层"是叠层不是条件：拆成多层 buff，每层填该层增量（见命名规范），不要误用 condition。
4. 不要为整个实体统一加条件。`

/**
 * @desc Buff 级规则 `rules`（与 `condition` 平级，可选）：`chains` / `refinements` 之外的三类门槛。
 * 规则之间全部 AND；`buffActive`（依赖其它 BUFF 生效）不入库 —— 它引用工程内 buff id，Buff 集里没有该 id 空间。
 */
export const CONDITION_BUFF_RULES_TEXT = `可选的 "rules"（与 buffName/scope 平级，数组；规则之间全部 AND）。
**同一种条件只能有一条**（例如不要输出两条 enemyType）；只在文案明确需要时输出，不确定就省略：

- 伤害名：{"kind":"damageNameRegex","pattern":"共鸣解放|处决"}
  本次伤害条目的显示名匹配该正则（包含匹配；要全等用 ^…$）。仅用于"只对某招式 / 某段伤害生效"。
- 面板数值：{"kind":"zoneCompare","charIdx":-1,"zone":"critRate","op":"ge","value":60}
  某角色的面板数值比较；charIdx 取 -1（出伤者，本次伤害所属角色）或 0（本角色，即该增益所属角色）。
  zone 取 atk / hp / def / recharge / offTuneBuildupRate / critRate / critDmg；
  op 取 ge / gt / eq / le / lt；单位与面板显示一致（攻/生/防为整数，其余为百分数）。
  仅用于"面板达到 X 时才生效"（如"生命高于 3 万时"）。
- 敌人类型（**多选**）：{"kind":"enemyType","types":["BOSS","精英怪"]}
  types 取 BOSS / 精英怪 / 小怪，命中任意一项即满足。仅用于"对 BOSS / 精英怪 / 小怪"。

示例（同时输出 chains 与 rules）：
{"folder":"对 BOSS 额外提升暴击伤害","buffName":"暴击伤害20%","scope":"self","exclusive":false,
 "condition":{"chains":[{"charIdx":0,"min":2}],"rules":[{"kind":"enemyType","types":["BOSS"]}]},
 "zones":[{"zoneId":"critDmg","value":20,"ref":null,"override":false,"condition":null}]}`

// ── 引用乘区转模规则（get_ref_rules 工具返回）────────────
export const REF_RULES_TEXT = `引用乘区（ref）的完整转模规则。ref 表示增益数值按"目标属性"动态换算，结构：
{"targetZoneId":"...","threshold":n,"pct":n,"discrete":true,"divisor":n,"multiplier":n,"lower":n,"upper":n,"refOwner":"self"|"owner"|"active"}

计算语义（必须与工具箱一致）：
- threshold（基准/阈值，默认 0）：只取目标属性"超出 threshold 的部分"参与换算。文案特征："超过/高于 X 的部分"。
- 线性转模（默认，不写 discrete）：超出部分按百分比 → value = (属性 - threshold) × pct / 100。文案特征："按/根据某属性的 X%"、"每 1 点属性转 X%"（无 discrete 时）。
- 离散转模（discrete=true）：超出部分按"每 divisor 转 multiplier"取整档 → value = floor((属性 - threshold) / divisor) × multiplier。文案特征："每 X 点属性转 Y"、"每 100 攻击提升 5%"。
- lower / upper（结果上下限）：换算结果低于 lower 时按 lower，高于 upper 时按 upper。文案特征："至少 X"、"最高/上限 X"。
- refOwner：self = 引用对象自身面板（角色增益引用自己）；owner = 引用"主人"面板（武器/声骸/套装的增益引用装备它的角色）；
  active = 引用出伤者面板（本次伤害所属角色）。
  角色类 buff 默认 self；武器/声骸/套装类 buff 默认 owner。

判定要点：
1. "每 X 转 Y"、"每 X 点提升 Y" → 离散档位（discrete + divisor + multiplier），不要用 pct。
2. "按某属性 X%"（无"每"字）→ 线性 pct。
3. 只写"根据某属性"但没给比例/档位 → 无法量化，不输出该 buff。
4. "超过/高于某值"才给 → threshold 填该值；未提基准 → 不写 threshold（按 0 处理）。
5. "最高/最多/上限" → upper；"至少/保底" → lower。
6. ref.targetZoneId 只能取系统提示中的引用乘区白名单；value 填 0（数值由转模计算得出）。
7. pct 只对线性转模有意义：离散转模（discrete + divisor + multiplier）不要写 pct，省略即可（缺省按 0 处理）。`

// ── buffName 硬性格式：不属于命名风格，用户自定义规则也必须遵守 ──
export const BUFF_NAME_LEAF_RULE_TEXT = `命名硬性格式（任何命名风格都必须遵守）：
- 每条 buff 有且只有两段：folder（游戏原文案）+ buffName（效果），全名 = \`原文案 \\ 效果\`。
- 反斜杠只能由系统拼接：JSON 的 buffName 里**禁止**出现反斜杠，也不要自带文件夹前缀。
- folder 里禁止出现反斜杠 / 正斜杠；buffName 里需要层级时用正斜杠 /。
- 一句话（一条原文）拆出的多条 buff，共用同一个 folder，靠 buffName 的数值 / 层数 / 阶数区分。`

// ── 命名规范（get_naming_rules 工具返回）────────────────────
export const NAMING_RULES_TEXT = `工坊 Buff 集命名规范（两段式，必须严格遵守）。

全名 = 文件夹 \\ Buff 短名 = 「游戏原文案」 \\ 「效果(层数/阶数/链)」

═══ 一、folder：默认照抄原文 ═══
1. **默认把游戏原文整句抄进 folder**（effect / statNodes / chains / skills 的 desc），
   只去掉增益数值；触发动作、限定语、持续时间、叠层、目标条件、并列列举全部保留。
   不改写、不概括、不调语序、不用黑话。
2. 只有两种情况才压缩（其余一律照抄）：
   a) 去数值后仍 >20 字（会被截断）；b) folder 与 folder 内 buff 名长度严重失衡（表格列宽）。
   压缩顺序：删与增益无关的从句 → 删并列列举尾巴（保留前 1–2 项）→ 删修饰语。
   **触发条件与效果主词不得删，语义不得变。**
3. 拿不准是否压缩时保留原文，并在报告里注明「folder 偏长」。
4. folder 必须能看出触发条件；常驻写「常驻」或效果类别。
5. 长度平衡只用来判断「要不要压缩」：folder 内各 buff 名长度之和 ≈ folder 长（0.7–1.6 倍）。
   buff 名过短时优先把属性/类型限定补进 buff 名，不要继续砍 folder。
6. 一句原文一个 folder；同句拆出的多条 buff 共用。
7. folder 内禁止反斜杠 / 正斜杠；不写「第3链」「精炼1阶」档位前缀（档位由 condition 表达）。
8. 不出现悬空指代与省略宾语的泛指（「幻形后」「触发后」补成具名对象）。
9. **首位声骸实体**：folder 带声骸名并按语义分两个 → 「装配<声骸名>」/「施放<声骸名>」。
10. **套装实体**：folder = 「<套装名><N件>」（如 隐世2件 / 隐世5件），多个件数各建 folder；
    buffName 只写效果+数值，不重复套装名与件数。
11. 所有实体类型都按以上规则（武器不写武器名）。

═══ 二、buffName：效果 ═══
格式：\`<效果名><数值?>(<层数|阶数|链>)?\`
1. 效果名用乘区黑话（见 get_slang_dict），并遵守**前缀在前、乘区词在后、不用括号**：
   - 属性增伤 → \`<属性>加成\`（湮灭加成、热熔加成、冷凝加成…）
   - 类型增伤 → \`<类型>加成\`（共技加成、普攻加成、共解加成…）
   - 加深 → \`<前缀>加深\`；穿透/抗性 → \`<属性>穿抗 / <属性>减抗\`
   - 无属性/类型限定 → 乘区词+数值：攻击 / 暴击率 / 暴击伤害 / 增伤 / 终伤 / 穿防 / 减抗 / 额外倍率(攻击) / 同奏层数…
   - 精准到某技能倍率（原文点名技能，如「你无法逃离！」最终伤害提升25%）→ \`25%终伤\`，
     **不把元素/伤害类型写进名字**，元素/类型放乘区级 condition。
   - 禁止 \`增伤(湮灭)\` / \`加深(共鸣技能)\` / \`穿抗(热熔)\` 这类括号写法。
2. 数值直接跟在效果名后，不带空格：
   - 百分比：\`攻击10%\`、\`暴击率15%\`、\`共技加成20%\`
   - 固定值：\`穿防100点\`
3. **每条名字都要写「加多少」**，禁止只写乘区；层/链用括号放末尾：
   - 叠层：\`10%攻击(1层)\`、\`10%攻击(2层)\`（括号前是**该层单层值**）
   - 角色共鸣链：\`15%暴击伤害(3链)\`（该条实际生效值）
   - **武器精炼阶不进名字**：只写「数值+乘区」，数值用原文该阶的数值（不是增量），
     例 10%/12%/14%/16%/20% → \`10%暴击伤害\` \`12%暴击伤害\` \`14%暴击伤害\` \`16%暴击伤害\` \`20%暴击伤害\`；
     相邻阶数值相同时合并成一条（condition 取较小阶），避免同 folder 重名。
4. 转模（数值由引擎按面板算）不写数值：\`共技加成(转模)\`、\`额外倍率(攻击)\`
5. 短名里**不重复**文件夹已有的信息：不写归属者短名、不写「全队+」前缀、不写触发动作。
   **武器类 buff 不带武器名**：folder 与 buffName 里都不出现武器名（实体已限定），也不要写
   「装备者/佩戴者」这类代称，只写效果本身。
6. 不带方括号 / 尖括号；同一文件夹下短名必须唯一（重名时补区分词，如 \`攻击(主)\`）。

═══ 三、拆分规则 ═══
1. 同一句原文里多个乘区 → 多条 buff，同一 folder，buffName 各写各的乘区：
   例：「攻击提升10%，暴击率提升5%」→ 同 folder 下两条：\`攻击10%\` 与 \`暴击率5%\`。
2. 同一乘区在不同条件下数值不同（伤害类型 / 属性） → 多条同 zoneId，各带乘区级 condition，
   buffName 用前缀区分：\`共技加成20%\`、\`普攻加成10%\`。
3. 叠层 / 精炼阶 / 共鸣链 → 拆多条，裸层数/阶数写进括号（见上），数值填**增量**：
   - 第 n 层 value = 第 n 层效果 − 第 n-1 层效果（每层固定 +5% 时各层都填 5）
   - 武器 1-5 阶同理，每阶填该阶增量（10/12/14/16/20 → 10、2、2、2、4）
   - 原因：引擎按「≥n 全部生效」叠加，只有增量才能得到正确累计。
4. 不属于增益的效果（治疗/护盾/能量/冷却/纯伤害倍率）不要生成。

═══ 四、示例（角色）═══
输入：{"chains":[{"name":"孤身孑然","desc":"施放第5段普攻时，散华自身暴击提升15%，持续10秒。"},
               {"name":"曙色天光","desc":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升10%，持续20秒，可叠加2层。"}]}
输出：
{"buffs":[
  {"folder":"施放第5段普攻时，散华自身暴击提升，持续10秒","buffName":"暴击率15%","scope":"self","zones":[{"zoneId":"critRate","value":15}]},
  {"folder":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升，持续20秒，可叠加2层","buffName":"攻击(1层)","scope":"team","zones":[{"zoneId":"atkPct","value":10}]},
  {"folder":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升，持续20秒，可叠加2层","buffName":"攻击(2层)","scope":"team","zones":[{"zoneId":"atkPct","value":10}]}
]}

═══ 五、示例（武器，5 阶）═══
输入：{"effect":{"desc":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）。共鸣技能伤害提升8%"}}
输出：
{"buffs":[
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"10%暴击伤害","condition":{"refinements":[{"charIdx":0,"min":1}]},"zones":[{"zoneId":"critDmg","value":10}]},
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"12%暴击伤害","condition":{"refinements":[{"charIdx":0,"min":2}]},"zones":[{"zoneId":"critDmg","value":2}]},
  {"folder":"共鸣技能伤害提升8%","buffName":"共技加成8%","zones":[{"zoneId":"bonusDmg","value":8}]}
]}

乘区黑话补充（**按文案措辞判，最容易错的是「伤害提升 / 伤害加成 / 倍率提升」三兄弟**）：
- 特殊终伤（相加）：specialFinal1，名字写「X%倍率提升」——"具名招式 + 伤害倍率提升"就是它；
  文案**不会**写"特殊终伤"四个字，别等这四个字。
- 特殊终伤（乘算，多个来源相乘）：specialFinal2，名字写「X%倍率提升(乘算)」——文案明确"与其它效果相乘/连乘"时才用。
- 额外倍率：extraRatio，名字写「X%额外倍率」——**只**用于「额外造成 / 追加一段伤害」（新增一击，值 ≈ 那一击的攻击倍率，常见 100–1700）；
  按属性换算时名字写「额外倍率(属性)」。
- 易伤：dmgTakenInc，名字写「X%易伤」——"具名招式 + 伤害提升"（**没有**"倍率"二字）、"目标受到的伤害提升"。
- 加成：bonusDmg —— **含「加成」二字必定是加成**；带属性/类型的"伤害提升"多半也是加成，不要判成易伤。
- 加深：deepenDmg（"造成的伤害加深 X%"）；终伤：finalDmg（"最终伤害提升 X%"）。
- 同奏增益层数：unisonBoonLayer（层数类乘区，flat 按层数填，如 +2 层 → value=2），名字写「同奏2层」；引擎按层数折算同奏区（每层 +3% 伤害），不要同时把它拆成增伤类数值，可以配引用/转模。
- 集谐干涉层数：tuneStrainLayer（层数类乘区，flat 按层数填），名字写「集谐2层」；引擎按「层数 × 该角色谐度破坏增幅 × 0.12%」折算集谐区。**只允许固定层数，不可配引用/转模，也不能作为引用目标** —— 它挂在目标/怪物身上、全队共用一份（不区分角色）。

${BUFF_NAME_LEAF_RULE_TEXT}`

// ── few-shot 示例（get_examples 工具返回）────────────────────
// 均来自真实工具箱 API 数据（节选），展示：两段式命名、scope/exclusive/ref/override 判定、
// 固有属性合并、叠层拆分、非 buff 剔除。
export const EXAMPLES_TEXT = `—— 示例1（角色固有属性合并）——
输入（角色的 statNodes 节选）：
[{"name":"攻击提升","desc":"攻击提升1.80%"},{"name":"攻击提升","desc":"攻击提升1.80%"},{"name":"攻击提升","desc":"攻击提升4.20%"},{"name":"冷凝伤害加成提升","desc":"冷凝伤害加成提升1.80%"},{"name":"冷凝伤害加成提升","desc":"冷凝伤害加成提升4.20%"}]
输出：
{"buffs":[
  {"folder":"攻击提升","buffName":"攻击7.8%","scope":"self","zones":[{"zoneId":"atkPct","value":7.8}]},
  {"folder":"冷凝伤害加成提升","buffName":"冷凝加成6%","scope":"self","zones":[{"zoneId":"bonusDmg","value":6}]}
]}
说明：同一乘区多处数值合并（1.8+1.8+4.2=7.8；1.8+4.2=6）；folder 是原文案去掉数值；命中自己 → scope=self。

—— 示例2（角色共鸣链，含 scope 判定与叠层拆分）——
输入（角色的 chains 节选）：
[{"name":"孤身孑然","desc":"施放第5段普攻时，散华自身暴击提升15%，持续10秒。"},{"name":"目视异常","desc":"散华攻击生命低于70%的目标时，造成的伤害提升35%。"},{"name":"曙色天光","desc":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升10%，持续20秒，可叠加2层。"}]
输出：
{"buffs":[
  {"folder":"施放第5段普攻时，散华自身暴击提升，持续10秒","buffName":"暴击率15%","scope":"self","zones":[{"zoneId":"critRate","value":15}]},
  {"folder":"散华攻击生命低于70%的目标时，造成的伤害提升","buffName":"增伤35%","scope":"self","zones":[{"zoneId":"bonusDmg","value":35}]},
  {"folder":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升，持续20秒，可叠加2层","buffName":"攻击(1层)","scope":"team","zones":[{"zoneId":"atkPct","value":10}]},
  {"folder":"引爆【冰棱】或【冰川】后，队伍中的角色攻击提升，持续20秒，可叠加2层","buffName":"攻击(2层)","scope":"team","zones":[{"zoneId":"atkPct","value":10}]}
]}
说明："自身"→scope=self；"队伍中的角色"→scope=team；"可叠加2层"（每层10%）→拆 1层/2层，各填增量（第2层增量=20-10=10）；"生命低于70%"是限定语义，数字保留在 folder。

—— 示例3（武器效果，叠层拆分）——
输入：{"effect":{"desc":"攻击提升15%。造成伤害时获得灼羽，每层使共鸣技能伤害加成提升5%，可叠14层"}}
输出：
{"buffs":[
  {"folder":"攻击提升","buffName":"攻击15%","scope":"self","zones":[{"zoneId":"atkPct","value":15}]},
  {"folder":"造成伤害时获得灼羽，每层使共鸣技能伤害加成提升，可叠14层","buffName":"5%共技加成(1层)","scope":"self","zones":[{"zoneId":"bonusDmg","value":5}]},
  {"folder":"造成伤害时获得灼羽，每层使共鸣技能伤害加成提升，可叠14层","buffName":"5%共技加成(2层)","scope":"self","zones":[{"zoneId":"bonusDmg","value":5}]}
]}
说明：武器攻击白值/副词条不是 buff，只提取 effect 描述；"每层+X%"每层填增量（各层都填 5，不填累计）。

—— 示例4（声骸套装，含 tier 区分）——
输入：{"bonuses":{"2":"治疗效果提升10%","5":"自身为友方提供治疗时，全队共鸣者攻击提升15%，持续30秒"}}
输出：
{"buffs":[
  {"folder":"自身为友方提供治疗时，全队共鸣者攻击提升，持续30秒","buffName":"攻击15%","scope":"team","zones":[{"zoneId":"atkPct","value":15}]}
]}
说明：治疗/回血不是 buff，2 件套不输出；"全队"→scope=team。套装件数属于归属信息，写在 folder 里可选：
若同一套装 2/5 件都有效果，folder 前加「2件套：」「5件套：」区分。

—— 示例5（角色技能，含 ref 引用自身）——
输入：{"skills":[{"name":"共鸣技能","desc":"造成衍射伤害，并根据当前攻击的50%额外造成伤害"}]}
输出：
{"buffs":[
  {"folder":"造成衍射伤害，并根据当前攻击额外造成伤害","buffName":"额外倍率(攻击)","scope":"self","zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":50,"refOwner":"self"}}]}
]}
说明："根据当前攻击的50%"→ref 引用 totalAtk，pct=50，value 填 0；转模条目 buffName 不写数值；角色自身 → refOwner="self"。

—— 示例6（武器效果，含 ref 引用主人）——
输入：{"effect":{"desc":"造成伤害，并根据装备者当前攻击的40%额外造成伤害"}}
输出：
{"buffs":[
  {"folder":"造成伤害，并根据装备者当前攻击额外造成伤害","buffName":"额外倍率(攻击)","scope":"self","zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":40,"refOwner":"owner"}}]}
]}
说明：武器效果"装备者当前攻击"→ refOwner="owner"，表示导入拉表时引用装备该武器的角色面板。

—— 示例7（角色共鸣链，含生效条件 chain）——
输入（角色的 chains 节选，注意共鸣链所属链数）：
[{"name":"暖雾","desc":"第1链：散华攻击提升8%。"},{"name":"孤影","desc":"第3链：散华暴击伤害提升20%。"}]
输出：
{"buffs":[
  {"folder":"第1链：散华攻击提升","buffName":"攻击8%","scope":"self","zones":[{"zoneId":"atkPct","value":8}]},
  {"folder":"第3链：散华暴击伤害提升","buffName":"暴击伤害(3链)","scope":"self","condition":{"chains":[{"charIdx":0,"min":3}]},"zones":[{"zoneId":"critDmg","value":20}]}
]}
说明：第1链视为基础配置不设 condition；"第3链"明确有门槛 → 实例级 chains；拆分条目把链数写进括号、不写数值，
条件性数值仍由 zones 承载；folder 保留「第3链：」前缀便于溯源。

—— 示例8（武器精炼：1-5 阶全拆 + 增量填值）——
输入：{"effect":{"desc":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）。共鸣技能伤害提升8%"}}
输出：
{"buffs":[
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"10%暴击伤害","scope":"self","condition":{"refinements":[{"charIdx":0,"min":1}]},"zones":[{"zoneId":"critDmg","value":10}]},
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"12%暴击伤害","scope":"self","condition":{"refinements":[{"charIdx":0,"min":2}]},"zones":[{"zoneId":"critDmg","value":2}]},
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"14%暴击伤害","scope":"self","condition":{"refinements":[{"charIdx":0,"min":3}]},"zones":[{"zoneId":"critDmg","value":2}]},
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"16%暴击伤害","scope":"self","condition":{"refinements":[{"charIdx":0,"min":4}]},"zones":[{"zoneId":"critDmg","value":2}]},
  {"folder":"暴击伤害提升 10%/12%/14%/16%/20%（对应精炼1-5阶）","buffName":"20%暴击伤害","scope":"self","condition":{"refinements":[{"charIdx":0,"min":5}]},"zones":[{"zoneId":"critDmg","value":4}]},
  {"folder":"共鸣技能伤害提升","buffName":"共技加成8%","scope":"self","zones":[{"zoneId":"bonusDmg","value":8}]}
]}
说明：按精炼阶给不同数值 → 拆 5 条（condition refinements 1..5）；**buffName 不写阶**，
     只写「原文该阶数值 + 乘区」（10%暴击伤害 / 12%暴击伤害 …），zones 里填该阶增量（10/2/2/2/4）。

—— 示例9（角色转模：离散档位「每 X 转 Y」+ 上限）——
输入：{"skills":[{"name":"共鸣技能","desc":"施放共鸣技能时，攻击力高于 2000 的部分，每 100 点攻击使暴击伤害提升 5%，最多提升 30%"}]}
输出：
{"buffs":[
  {"folder":"施放共鸣技能时，攻击力高于 2000 的部分，每 100 点攻击使暴击伤害提升，有上限","buffName":"暴击伤害(转模)","scope":"self","zones":[{"zoneId":"critDmg","value":0,"ref":{"targetZoneId":"totalAtk","threshold":2000,"discrete":true,"divisor":100,"multiplier":5,"upper":30,"refOwner":"self"}}]}
]}
说明：阈值/每档参数属于换算条件，数字保留在 folder；增益数值（5%/上限30%）只进 ref；buffName 标注(转模)不写数值。

—— 示例10（角色转模：线性百分比 + 下限）——
输入：{"skills":[{"name":"共鸣技能","desc":"根据自身攻击超出 1000 的部分的 2% 提升共鸣技能伤害，至少提升 5%"}]}
输出：
{"buffs":[
  {"folder":"根据自身攻击超出 1000 的部分提升共鸣技能伤害，有保底","buffName":"共技加成(转模)","scope":"self","zones":[{"zoneId":"bonusDmg","value":0,"ref":{"targetZoneId":"totalAtk","threshold":1000,"pct":2,"lower":5,"refOwner":"self"}}]}
]}
说明："超出 1000 的部分的 2%"→threshold=1000 + pct=2（线性）；"至少 5%"→lower=5。

—— 示例11（特殊终伤(2)·乘算 specialFinal2）——
输入：{"skills":[{"name":"共鸣技能","desc":"施放共鸣技能时，自身造成的伤害提升10%，此效果与其它同类型效果相乘计算。"}]}
输出：
{"buffs":[
  {"folder":"施放共鸣技能时，自身造成的伤害提升，此效果与其它同类型效果相乘计算","buffName":"特殊终伤(乘算)10%","scope":"self","zones":[{"zoneId":"specialFinal2","value":10}]}
]}
说明：文案明确"与其它效果相乘/连乘"→ specialFinal2；普通相加语义的特殊终伤用 specialFinal1。

—— 示例12（同一句「提升」，三种归属怎么分）——
输入A：{"skills":[{"name":"共鸣技能","desc":"共鸣技能·破空斩的伤害倍率提升 50%"}]}
输出A：{"buffs":[{"folder":"共鸣技能·破空斩的伤害倍率提升","buffName":"50%倍率提升","scope":"self","condition":{"rules":[{"kind":"damageNameRegex","pattern":"破空斩"}]},"zones":[{"zoneId":"specialFinal1","value":50}]}]}
说明A：游戏里的「伤害倍率提升 X%」= 特殊终伤（**不是**额外倍率）；点名某个技能时用 damageNameRegex 限定。

输入B：{"skills":[{"name":"共鸣技能","desc":"施放共鸣技能时，额外造成一次导电伤害，该伤害的倍率为 900% 攻击"}]}
输出B：{"buffs":[{"folder":"施放共鸣技能时，额外造成一次导电伤害","buffName":"900%额外倍率","scope":"self","zones":[{"zoneId":"extraRatio","value":900}]}]}
说明B："额外造成一次…伤害，倍率 900%" = 新增一段伤害 → 额外倍率；值就是那一击的攻击倍率 900（不走 ref、不要写成特殊终伤）。

输入C：{"skills":[{"name":"共鸣技能","desc":"共鸣技能·破空斩的伤害倍率提升 20%，此效果与其它同类型效果相乘计算"}]}
输出C：{"buffs":[{"folder":"共鸣技能·破空斩的伤害倍率提升，此效果与其它同类型效果相乘计算","buffName":"20%倍率提升(乘算)","scope":"self","condition":{"rules":[{"kind":"damageNameRegex","pattern":"破空斩"}]},"zones":[{"zoneId":"specialFinal2","value":20}]}]}
说明C：明确"与其它效果相乘/连乘"→ 特殊终伤(乘算)；否则同 A 走 specialFinal1。

—— 示例13（refOwner="active"：引用出伤者）——
输入：{"skills":[{"name":"共鸣技能","desc":"根据造成伤害的角色当前攻击的 30% 额外造成伤害"}]}
输出：
{"buffs":[
  {"folder":"根据造成伤害的角色当前攻击额外造成伤害","buffName":"额外倍率(攻击·出伤者)","scope":"team","zones":[{"zoneId":"extraRatio","value":0,"ref":{"targetZoneId":"totalAtk","pct":30,"refOwner":"active"}}]}
]}
说明："按造成伤害的角色"= 出伤者 → refOwner="active"（不是 self / owner）；不限定角色 → scope="team"。

—— 示例14（条件：具名招式正则 + 敌人类型多选）——
输入：{"skills":[{"name":"共鸣解放","desc":"共鸣解放·终曲造成的伤害倍率提升 20%，对 BOSS 与精英怪额外生效"}]}
输出：
{"buffs":[
  {"folder":"共鸣解放·终曲造成的伤害倍率提升，对 BOSS 与精英怪额外生效","buffName":"20%倍率提升","scope":"self",
   "condition":{"rules":[{"kind":"damageNameRegex","pattern":"共鸣解放·终曲"},{"kind":"enemyType","types":["BOSS","精英怪"]}]},
   "zones":[{"zoneId":"specialFinal1","value":20}]}
]}
说明：具名招式 + "倍率提升" → specialFinal1；点名招式用 damageNameRegex（包含匹配），敌人多选用 enemyType.types；规则之间 AND、同类只能一条。

—— 示例15（条件：链门槛 + 面板门槛）——
输入：{"chains":[{"name":"共鸣链","desc":"第3链：暴击率高于 60% 时，共鸣解放伤害倍率提升 30%"}]}
输出：
{"buffs":[
  {"folder":"第3链：暴击率高于 60% 时，共鸣解放伤害倍率提升","buffName":"30%倍率提升","scope":"self",
   "condition":{"chains":[{"charIdx":0,"min":3}],"rules":[{"kind":"zoneCompare","charIdx":-1,"zone":"critRate","op":"ge","value":60}]},
   "zones":[{"zoneId":"specialFinal1","value":30}]}
]}
说明：链门槛写 condition.chains；"暴击率高于 60%"是面板门槛 → rules 的 zoneCompare（charIdx=-1 = 出伤者，0 = 本角色）；
      工坊里 charIdx 恒写 0，导入工具箱时按实体归属自动重指。`

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
额外倍率=额外倍率(攻击/生命/防御) // 只用于「额外造成 / 追加一段伤害」；括号里写引用属性
倍率提升=倍率提升 // 游戏文案「伤害倍率提升 X%」→ specialFinal1，短名写 X%倍率提升
倍率提升(乘算)=倍率提升(乘算) // 文案明确「与其它效果相乘/连乘」→ specialFinal2
最终伤害提升=终伤 // 没有「倍率提升」也没有「特殊终伤」时用 finalDmg
伤害提升(易伤)=易伤
属性抗性无视=穿抗
防御无视=穿防
减防=减防
抗性降低=减抗
全队作用=全队 // 只影响 scope 判定（team），两段式命名里不写进名字
追加效果=追加 // 追加10气动、追加转模攻击
叠层=层 // 短名末尾括号写 (N层)，如 暴击率(1层)
武器精炼=阶 // 名字不写阶；只写「原文该阶数值+乘区」，如 10%暴击伤害（阶由 condition 表达）
角色链=链 // 短名末尾括号写 (N链)，如 暴击伤害(3链)
转模=转模 // 短名末尾括号写 (转模)，且不写数值，如 共技加成(转模)`
