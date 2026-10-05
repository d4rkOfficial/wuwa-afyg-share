// 主工具导出的工程文件结构（src/lib/data/types.ts 的镜像，字段向后兼容读取）

export interface SelectedSet {
    name: string
    pieces: number
}

export interface EchoSlot {
    name: string | null
    cost: number
}

export interface CharSlot {
    character: string | null
    weapon: string | null
    triggerSets: SelectedSet[]
    /**
     * @desc 声骸槽位：主工具**只导出已装备的槽位**（长度可少于 5，常见为 3）。
     * 工坊不补齐 —— 补齐会改变落库内容，也让「下载 = 上传的文件」这个承诺失真。
     */
    echoes: EchoSlot[]
    /** @desc 共鸣链（0-6）—— 链/阶真源在队伍槽位上，工坊只做透传 */
    chain?: number
    /** @desc 武器精炼阶（1-5，0 = 无专） */
    refinement?: number
}

export interface PhaseState {
    locked: boolean
    data: unknown
}

/**
 * @desc 主工具导出的工程数据。
 *
 * 这里只声明工坊自己会读的字段；其余字段（`conditionProfile` / `comparison` / `buffs` /
 * `version` / `analysis` …）**允许存在且必须原样透传**，因此留了索引签名。
 * 工坊是分享中转站，绝不能因为「不认识这个字段」就把它从落库内容里抹掉
 * —— 那正是「上传工坊再下载丢链/阶」的成因。
 */
export interface ProjectData {
    id: string
    name: string
    createdAt: number
    team: [CharSlot, CharSlot, CharSlot]
    customSkillHits: Record<string, unknown>
    resultAnalysis?: unknown
    lockedTeamKey?: string
    lockedTeamNames?: string[]
    phases: {
        team: PhaseState
        timeline: PhaseState
        calculation: PhaseState
        config: PhaseState
    }
    [key: string]: unknown
}

/** 主工具导出的文件：{ version, exportedAt, project } 或裸数组/裸对象（旧版兼容） */
export interface ProjectFile {
    version?: number
    exportedAt?: number
    project?: ProjectData
}

export const EXPORT_VERSION = 1
export const MAX_FILE_BYTES = 1024 * 1024 // 1MB

export const PHASE_KEYS = ['team', 'timeline', 'calculation', 'config'] as const
export type PhaseKey = (typeof PHASE_KEYS)[number]

export const PHASE_LABELS: Record<PhaseKey, string> = {
    team: '队伍配置',
    timeline: '排轴',
    calculation: '拉表',
    config: '词条/环境配置'
}

export const ELEMENTS = ['物理', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭'] as const
export type Element = (typeof ELEMENTS)[number]

export const ELEMENT_COLORS: Record<string, string> = {
    冷凝: '#38bdf8',
    热熔: '#fb923c',
    导电: '#a855f7',
    气动: '#34d399',
    衍射: '#facc15',
    湮灭: '#f472b6'
}

/** 元数据预览（服务端提取后入库） */
export interface TeamPreview {
    slots: CharSlot[]
    names: string[]
    locked: Record<PhaseKey, boolean>
    version: string | null
}
