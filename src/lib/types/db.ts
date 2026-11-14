// 数据库行类型（与 supabase/migrations/init.sql 保持一致，手动维护）

import type { TeamPreview } from '@/lib/types/project'

export interface ProjectRow {
    id: string
    code: string
    author_id: string
    author_name: string
    title: string
    description: string
    tags: string[]
    game_version: string | null
    team_preview: TeamPreview | null
    file_size: number
    published: boolean
    expires_at: string | null
    view_count: number
    clone_count: number
    created_at: string
    updated_at: string
    // [0004] 保护状态：批量删除 / 单条删除 / 过期清理均豁免
    protected: boolean
}

// 列表页用投影（不含大字段 project_blob）
export type ProjectListItem = Omit<ProjectRow, 'file_size'>

export interface ProfileRow {
    id: string
    username: string
    is_admin: boolean
    created_at: string
}

// Buff 集数据行类型（0009_buff_sets.sql / 0011_buff_sets_meta.sql）
export type BuffEntityType = 'character' | 'weapon' | 'echo' | '1set' | '2set' | '3set' | '4set' | '5set'

// 受影响者：自己 / 自己除外 / 全队 / 效应专属
export type BuffScope = 'self' | 'self_except' | 'team' | 'effect_only'

// 引用归属：self / owner = 引「本角色」面板（角色自身 / 武器·声骸·套装的装备者）；
// active = 引「出伤者」面板（本次伤害所属角色）
export type BuffRefOwner = 'self' | 'owner' | 'active'

// 链条件 / 阶条件子句：charIdx 为受益角色槽位（0-2），min 为门槛（链 0-6，0=角色本体；阶 1-5）
export interface BuffGateClause {
    charIdx: number
    min: number
}

// ── Buff 级规则（与 wuwa-afyg-tool 的 BuffRule 逐字对齐；规则之间全部 AND）──

// 敌人类型档位（与工具箱工程敌人配置的字面量一致）
export type BuffEnemyTypeKind = 'BOSS' | '精英怪' | '小怪'
// 面板数值比较的运算符
export type BuffZoneCompareOp = 'gt' | 'ge' | 'lt' | 'le' | 'eq'

// 「面板数值」条件可比较的属性（工具箱的聚合面板键，不是乘区 id）
export type BuffZoneCompareId =
    | 'atk'
    | 'hp'
    | 'def'
    | 'recharge'
    | 'offTuneBuildupRate'
    | 'tuneBreakBoost'
    | 'unisonBoonLayer'
    | 'critRate'
    | 'critDmg'

export type BuffRule =
    | { kind: 'chain'; charIdx: number; min: number }
    | { kind: 'refinement'; charIdx: number; min: number }
    | { kind: 'damageNameRegex'; pattern: string }
    | { kind: 'zoneCompare'; charIdx: number; zone: BuffZoneCompareId; op: BuffZoneCompareOp; value: number }
    | { kind: 'enemyType'; types: BuffEnemyTypeKind[] }
    | { kind: 'buffActive'; mode: 'all' | 'any'; buffIds: string[] }

// 生效条件：按挂载位置分两层（与 wuwa-afyg-tool 一致）
// - Buff 实例级（buff_sets.condition）：chains / refinements（硬性门槛，可并存）+ rules（规则列表，全部 AND）；
//   elements / damageTypes 为兼容读取（工具箱读取时会下放到乘区）
// - 乘区级（buff_set[].condition）：只允许 elements / damageTypes
export interface BuffCondition {
    /** @desc 链条件：角色共鸣链 ≥ min（硬性门槛，仅实例级） */
    chains?: BuffGateClause[]
    /** @desc 阶条件：武器精炼 ≥ min（硬性门槛，仅实例级；与 chains 可并存） */
    refinements?: BuffGateClause[]
    /** @desc 兼容旧结构：等价于 chains=[{ charIdx: 0, min: chain }] */
    chain?: number
    /** @desc 兼容旧结构：等价于 refinements=[{ charIdx: 0, min: refinement }] */
    refinement?: number
    elements?: string[]
    damageTypes?: string[]
    /** @desc Buff 级规则（仅实例级；`buffActive` 需要有工程内 buff id 才能表达，工坊不入库） */
    rules?: BuffRule[]
}

export interface BuffZoneRef {
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

// 乘区**贡献条目**：同一乘区可出现多次，每次是独立贡献单元（各带数值 / 引用 / 覆盖 / 自己的生效条件）
export interface BuffZoneValue {
    zoneId: string
    value: number
    ref?: BuffZoneRef
    override?: boolean
    /** @desc 乘区级生效条件（只允许伤害类型 / 伤害属性；链/阶由实例级统一把关） */
    condition?: BuffCondition
}

export interface BuffSetRow {
    /** @desc 稳定 id（迁移后由数据库生成；旧快照/旧客户端可缺省） */
    id?: string
    entity_type: BuffEntityType
    entity_name: string
    /** @desc 全名：`文件夹A\buff名`；根 Buff 直接是短名 */
    buff_name: string
    scope: BuffScope
    exclusive: boolean
    condition?: BuffCondition | null
    buff_set: BuffZoneValue[]
    /** @desc 实体内的排序（文件夹在前、根 Buff 在后） */
    sort_order?: number
}

/** @desc 一级文件夹：只存名字/排序/空文件夹；成员按 buff_name 的 `文件夹\` 前缀归属 */
export interface BuffFolderRow {
    id?: string
    entity_type: BuffEntityType
    entity_name: string
    name: string
    sort_order: number
}

/** @desc 快照 state v2：Buff + 文件夹 */
export interface BuffSnapshotState {
    buffs: BuffSetRow[]
    folders: BuffFolderRow[]
}

// ── 标准词条集（0004_standard_substat_sets.sql）──
// 单条词条（主词条 / 副主词条 / 副词条同构，对齐 wuwa-afyg-tool 的 EchoStat）
export interface EchoStatValue {
    type: string
    value: number
    unit: '' | '%'
}

// 单个声骸部位（对齐 wuwa-afyg-tool 的 EchoSlotConfig，去掉 name/set）
export interface EchoPlanSlot {
    cost: number
    mainStat: EchoStatValue | null
    secondMainStat: EchoStatValue | null
    substats: EchoStatValue[]
}

// 整份标准方案：恰好 5 个部位、cost 多重集合 {4,3,3,1,1}、副词条合计恰好 14 条
export interface EchoPlan {
    slots: EchoPlanSlot[]
}

export interface StandardSubstatSetRow {
    id: string
    character_name: string
    plan: EchoPlan
    note: string | null
    updated_at: string
}

export interface AnnouncementRow {
    id: string
    title: string
    content: string
    created_at: string
}

// ── 编辑锁（supabase/migrations/edit-locks.sql）──
// 全局锁：locked = true 时仅管理员可编辑该域；false 时登录用户都能编辑
export type EditScope = 'buff_sets' | 'substat_sets'

export interface EditLockRow {
    scope: EditScope
    locked: boolean
    updated_at: string
}

// 条目级锁：被锁的实体 / 角色即使全局锁关闭，也仍然只有管理员能编辑
export interface BuffSetLockRow {
    entity_type: BuffEntityType
    entity_name: string
    locked: boolean
}

export interface SubstatSetLockRow {
    character_name: string
    locked: boolean
}

// Buff 集单快照行（0002_buff_set_snapshot.sql，全表至多一行）
export interface BuffSnapshotRow {
    id: string
    created_by: string | null
    created_at: string
    note: string
    state: BuffSnapshotState
}

// 管理员授权边（0003_admin_grants.sql；granted_by null = 根管理员）
export interface AdminGrantRow {
    id: string
    grantee_id: string
    granted_by: string | null
    granted_at: string
}
