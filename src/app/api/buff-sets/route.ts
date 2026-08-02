import { createClient, hasEnv } from '@/lib/supabase/server'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

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
        .select('entity_type, entity_name, buff_name, scope, exclusive, buff_set')

    if (entityType && ENTITY_TYPES.has(entityType)) query = query.eq('entity_type', entityType)
    if (entityName) query = query.eq('entity_name', entityName)
    if (q) query = query.or(`entity_name.ilike.%${q}%,buff_name.ilike.%${q}%`)

    query = query.order('entity_type', { ascending: true }).order('entity_name', { ascending: true })

    const { data, error } = await query

    if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })

    const buffSets: BuffSetRow[] = (data ?? []).filter(
        (row): row is BuffSetRow => ENTITY_TYPES.has(row.entity_type as BuffEntityType)
    )
    return Response.json({ buffSets, total: buffSets.length }, { headers: CORS_HEADERS })
}