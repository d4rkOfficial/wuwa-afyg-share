// 数据库行类型（与 supabase/migrations/0001_init.sql 保持一致，手动维护）

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

export interface BuffZoneRef {
    targetZoneId: string
    pct: number
    threshold?: number
    lower?: number
    upper?: number
    discrete?: boolean
    divisor?: number
    multiplier?: number
}

export interface BuffZoneValue {
    zoneId: string
    value: number
    ref?: BuffZoneRef
    override?: boolean
}

export interface BuffSetRow {
    entity_type: BuffEntityType
    entity_name: string
    buff_name: string
    scope: BuffScope
    exclusive: boolean
    buff_set: BuffZoneValue[]
}
