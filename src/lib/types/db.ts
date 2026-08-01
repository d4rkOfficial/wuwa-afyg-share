// 数据库行类型（与 supabase/migrations/0001_init.sql 保持一致，手动维护）

import type { ProjectFile, TeamPreview } from '@/lib/types/project'

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
    project_json: ProjectFile
    file_size: number
    published: boolean
    expires_at: string | null
    view_count: number
    clone_count: number
    created_at: string
    updated_at: string
}

// 列表页用投影（不含 project_json，避免大字段）
export type ProjectListItem = Omit<ProjectRow, 'project_json'>
