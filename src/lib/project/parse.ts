import type { CharSlot, EchoSlot, PhaseKey, PhaseState, ProjectData } from '@/lib/types/project'
import { PHASE_KEYS } from '@/lib/types/project'
import { MAX_RAW_BYTES } from '@/lib/project/compress'

export class ProjectParseError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectParseError'
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function emptyCharSlot(): CharSlot {
    return {
        character: null,
        weapon: null,
        triggerSets: [],
        echoes: Array.from({ length: 5 }, () => ({ name: null, cost: 0 })) as CharSlot['echoes']
    }
}

function sanitizeTeam(raw: unknown): ProjectData['team'] {
    const slots = Array.isArray(raw) ? raw : []
    const team: ProjectData['team'] = [emptyCharSlot(), emptyCharSlot(), emptyCharSlot()]
    for (let i = 0; i < 3; i++) {
        const s = slots[i]
        if (!isRecord(s)) continue
        const character = typeof s.character === 'string' ? s.character : null
        const weapon = typeof s.weapon === 'string' ? s.weapon : null
        const triggerSets = Array.isArray(s.triggerSets)
            ? (s.triggerSets.filter(isRecord) as Record<string, unknown>[])
                  .map((t) => ({
                      name: typeof t.name === 'string' ? t.name : '',
                      pieces: typeof t.pieces === 'number' ? t.pieces : 0
                  }))
                  .filter((t) => t.name)
            : []
        const echoesRaw = Array.isArray(s.echoes) ? s.echoes : []
        const toEcho = (raw: unknown): EchoSlot => ({
            name: isRecord(raw) && typeof raw.name === 'string' ? raw.name : null,
            cost: isRecord(raw) && typeof raw.cost === 'number' ? raw.cost : 0
        })
        const echoes = [
            toEcho(echoesRaw[0]),
            toEcho(echoesRaw[1]),
            toEcho(echoesRaw[2]),
            toEcho(echoesRaw[3]),
            toEcho(echoesRaw[4])
        ] as CharSlot['echoes']
        team[i] = { character, weapon, triggerSets, echoes }
    }
    return team
}

function sanitizePhaseState(raw: unknown): PhaseState {
    if (!isRecord(raw)) return { locked: false, data: null }
    return {
        locked: raw.locked === true,
        data: 'data' in raw ? (raw.data as unknown) : null
    }
}

/**
 * 解析主工具导出的工程 JSON。
 * 兼容三种形态：
 *   1. { version, exportedAt, project }   — 当前导出格式
 *   2. [project, ...]                      — 旧版批量导出
 *   3. { ...project }                      — 裸工程对象
 */
export function parseProjectFile(raw: unknown): ProjectData {
    let project: Record<string, unknown> | null = null

    if (isRecord(raw)) {
        if (isRecord(raw.project)) {
            project = raw.project
        } else if ('team' in raw || 'name' in raw) {
            project = raw
        }
    } else if (Array.isArray(raw) && raw.length > 0 && isRecord(raw[0])) {
        project = raw[0]
    }

    if (!project) throw new ProjectParseError('无法识别的工程文件结构')

    const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : '未命名项目'
    const createdAt = typeof project.createdAt === 'number' ? project.createdAt : Date.now()

    const phases: ProjectData['phases'] = {
        team: sanitizePhaseState(project.phases),
        timeline: { locked: false, data: null },
        calculation: { locked: false, data: null },
        config: { locked: false, data: null }
    }

    if (isRecord(project.phases)) {
        for (const key of PHASE_KEYS) {
            phases[key] = sanitizePhaseState(project.phases[key])
        }
    }

    const lockedTeamNames = Array.isArray(project.lockedTeamNames)
        ? (project.lockedTeamNames.filter((n) => typeof n === 'string') as string[])
        : undefined

    return {
        id: typeof project.id === 'string' ? project.id : crypto.randomUUID(),
        name,
        createdAt,
        team: sanitizeTeam(project.team),
        customSkillHits: isRecord(project.customSkillHits) ? project.customSkillHits : {},
        resultAnalysis: project.resultAnalysis ?? undefined,
        lockedTeamKey: typeof project.lockedTeamKey === 'string' ? project.lockedTeamKey : undefined,
        lockedTeamNames,
        phases
    }
}

/** 解析前先校验为 JSON 且不超过尺寸上限 */
export function safeJsonParse(text: string, maxBytes = MAX_RAW_BYTES): unknown {
    const bytes = new TextEncoder().encode(text).length
    if (bytes > maxBytes) {
        throw new ProjectParseError(`文件超过 ${maxBytes / 1024 / 1024}MB 限制`)
    }
    try {
        return JSON.parse(text)
    } catch {
        throw new ProjectParseError('不是合法的 JSON 文件')
    }
}

export function phasesLocked(project: ProjectData): Record<PhaseKey, boolean> {
    return {
        team: project.phases.team.locked,
        timeline: project.phases.timeline.locked,
        calculation: project.phases.calculation.locked,
        config: project.phases.config.locked
    }
}
