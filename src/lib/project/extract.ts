import type { ProjectData, TeamPreview } from '@/lib/types/project'
import { phasesLocked } from '@/lib/project/parse'

export function extractTeamPreview(project: ProjectData): TeamPreview {
    const names =
        project.lockedTeamNames?.filter((n) => n) ??
        project.team
            .filter((s) => s.character)
            .map((s) => s.character as string)

    return {
        slots: project.team,
        names,
        locked: phasesLocked(project),
        version: null
    }
}

/** 列表/详情页展示用的角色名（锁定名优先，缺失则用 team 推导） */
export function teamDisplayNames(preview: Pick<TeamPreview, 'names' | 'slots'> | null): string[] {
    if (!preview) return []
    if (preview.names.length > 0) return preview.names
    return preview.slots.map((s) => s.character).filter((n): n is string => Boolean(n))
}
