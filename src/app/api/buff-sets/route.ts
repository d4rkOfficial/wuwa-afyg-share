import { createClient, hasEnv } from '@/lib/supabase/server'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'
import type { BuffEntityType, BuffFolderRow, BuffSetRow } from '@/lib/types/db'

export { handleOptions as OPTIONS }

const ENTITY_TYPES = new Set<BuffEntityType>([
    'character',
    'weapon',
    'echo',
    '1set',
    '2set',
    '3set',
    '4set',
    '5set'
])

export async function GET(req: Request) {
    if (!hasEnv()) return Response.json({ error: '服务未配置' }, { status: 503, headers: CORS_HEADERS })
    const supabase = await createClient()

    const url = new URL(req.url)
    const entityType = (url.searchParams.get('entity_type') ?? '').trim() as BuffEntityType
    const entityName = (url.searchParams.get('entity_name') ?? '').trim()
    const q = (url.searchParams.get('q') ?? '').trim().replace(/[%_\\]/g, '\\$&')

    let query = supabase
        .from('buff_sets')
        .select('id, entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set, sort_order')

    if (entityType && ENTITY_TYPES.has(entityType)) query = query.eq('entity_type', entityType)
    if (entityName) query = query.eq('entity_name', entityName)
    if (q) query = query.or(`entity_name.ilike.%${q}%,buff_name.ilike.%${q}%`)

    query = query
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
        .order('sort_order', { ascending: true })

    const { data, error } = await query

    if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })

    const buffSets: BuffSetRow[] = ((data ?? []) as BuffSetRow[]).filter((row) =>
        ENTITY_TYPES.has(row.entity_type)
    )
    const entityKeys = new Set(buffSets.map((row) => `${row.entity_type}/${row.entity_name}`))

    let folderQuery = supabase
        .from('buff_folders')
        .select('id, entity_type, entity_name, name, sort_order')
        .order('sort_order', { ascending: true })
    if (entityType && ENTITY_TYPES.has(entityType)) folderQuery = folderQuery.eq('entity_type', entityType)
    if (entityName) folderQuery = folderQuery.eq('entity_name', entityName)
    const { data: folderData, error: folderError } = await folderQuery
    if (folderError) return Response.json({ error: folderError.message }, { status: 500, headers: CORS_HEADERS })
    const folders: BuffFolderRow[] = ((folderData ?? []) as BuffFolderRow[]).filter(
        (row) => ENTITY_TYPES.has(row.entity_type) && entityKeys.has(`${row.entity_type}/${row.entity_name}`)
    )

    return Response.json(
        { buffSets, folders, total: buffSets.length },
        { headers: CORS_HEADERS }
    )
}