// 已收录 Buff 集的查询（AI 工具 `get_buff_sets` / `get_editing_context` / `diff_buffs` 的数据源）。
// 浏览器端直连 Supabase（RLS 只允许读公开数据），生成模型看不到数据库，只能通过工具按需查。
import { createClient } from '@/lib/supabase/client'

export async function queryBuffSets(queryType?: string, queryName?: string, query?: string) {
    const supabase = createClient()
    let q = supabase
        .from('buff_sets')
        .select('id, entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set, sort_order')
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
        .order('sort_order', { ascending: true })
    if (queryType) q = q.eq('entity_type', queryType)
    if (queryName) q = q.eq('entity_name', queryName)
    if (query) {
        const escaped = query.replace(/[%_\\]/g, '\\$&')
        q = q.or(`entity_name.ilike.%${escaped}%,buff_name.ilike.%${escaped}%`)
    }
    const { data, error } = await q.limit(200)
    if (error) return { error: error.message }
    const buffSets = data ?? []
    const keys = new Set(
        buffSets.map((row: { entity_type: string; entity_name: string }) => `${row.entity_type}/${row.entity_name}`)
    )
    let folderQuery = supabase
        .from('buff_folders')
        .select('id, entity_type, entity_name, name, sort_order')
        .order('sort_order', { ascending: true })
    if (queryType) folderQuery = folderQuery.eq('entity_type', queryType)
    if (queryName) folderQuery = folderQuery.eq('entity_name', queryName)
    const { data: folderData } = await folderQuery
    const folders = (folderData ?? []).filter((row: { entity_type: string; entity_name: string }) =>
        keys.has(`${row.entity_type}/${row.entity_name}`)
    )
    return { total: buffSets.length, buffSets, folders }
}
