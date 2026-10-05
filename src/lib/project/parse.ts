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
    return { character: null, weapon: null, triggerSets: [], echoes: [] }
}

/**
 * @desc 清洗队伍槽位：只规范化「列表展示必需」的字段，**其余字段原样保留**。
 *
 * 逐字段重建（只留 character/weapon/triggerSets/echoes）曾经把 `chain` / `refinement`
 * 直接抹掉 —— 工坊落库的是清洗后的对象，于是「上传工坊再下载」必然丢链/阶配置。
 * 故这里改为「展开原对象 + 覆盖规范化字段」，未知字段（含工具侧未来新增的）全部透传。
 */
function sanitizeCharSlot(raw: unknown): CharSlot {
    if (!isRecord(raw)) return emptyCharSlot()
    const toEcho = (e: unknown): EchoSlot => ({
        name: isRecord(e) && typeof e.name === 'string' ? e.name : null,
        cost: isRecord(e) && typeof e.cost === 'number' ? e.cost : 0
    })
    const echoesRaw = Array.isArray(raw.echoes) ? raw.echoes : []
    return {
        ...(raw as unknown as CharSlot),
        character: typeof raw.character === 'string' ? raw.character : null,
        weapon: typeof raw.weapon === 'string' ? raw.weapon : null,
        triggerSets: Array.isArray(raw.triggerSets)
            ? (raw.triggerSets.filter(isRecord) as Record<string, unknown>[])
                  .map((t) => ({
                      name: typeof t.name === 'string' ? t.name : '',
                      pieces: typeof t.pieces === 'number' ? t.pieces : 0
                  }))
                  .filter((t) => t.name)
            : [],
        // 只规范化长度与形状，**不补齐到 5 个**：主工具导出几个就是几个
        echoes: echoesRaw.map(toEcho)
    }
}

function sanitizeTeam(raw: unknown): ProjectData['team'] {
    const slots = Array.isArray(raw) ? raw : []
    return [sanitizeCharSlot(slots[0]), sanitizeCharSlot(slots[1]), sanitizeCharSlot(slots[2])]
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
 *
 * **工坊只是分享中转站，不做数据加工**：这里只规范化「列表/详情页预览必需」的字段
 * （id / name / createdAt / team / phases），其余字段一律 `...` 透传。
 *
 * 曾经是逐字段白名单重建，导致工坊落库时静默丢掉 `conditionProfile`（链/阶配置）、
 * `comparison`（链/阶对比点）、`analysis`（结果快照）、`buffs`、`version`，
 * 症状就是「上传工坊再下载后丢了链/阶」。工具侧字段会继续演进，
 * 白名单必然再次落后 —— 所以口径是「只覆盖认识的字段，不认识的照抄」。
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
        // 先铺开原对象（保留 version/conditionProfile/comparison/analysis/buffs 等全部字段）
        ...(project as unknown as ProjectData),
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
