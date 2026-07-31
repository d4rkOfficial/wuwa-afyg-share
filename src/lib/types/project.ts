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
    echoes: [EchoSlot, EchoSlot, EchoSlot, EchoSlot, EchoSlot]
}

export interface PhaseState {
    locked: boolean
    data: unknown
}

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
