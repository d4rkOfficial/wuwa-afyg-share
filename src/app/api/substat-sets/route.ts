import { createClient, hasEnv } from '@/lib/supabase/server'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'
import type { EchoPlan, StandardSubstatSetRow } from '@/lib/types/db'

export { handleOptions as OPTIONS }

// 公开只读：工具箱（wuwa-afyg-tool）拉取「标准词条集」用于一键把角色声骸改成标准词条。
// 工坊只收录特殊角色的整份方案；其余角色由工具箱本地按角色数据生成。
// note 为工坊内部备注，不入公开响应。
export async function GET(req: Request) {
    if (!hasEnv()) return Response.json({ error: '服务未配置' }, { status: 503, headers: CORS_HEADERS })
    const supabase = await createClient()

    const url = new URL(req.url)
    const characterName = (url.searchParams.get('character_name') ?? '').trim()
    const q = (url.searchParams.get('q') ?? '').trim().replace(/[%_\\]/g, '\\$&')

    let query = supabase
        .from('standard_substat_sets')
        .select('character_name, plan, updated_at')

    if (characterName) query = query.eq('character_name', characterName)
    if (q) query = query.ilike('character_name', `%${q}%`)

    const { data, error } = await query.order('character_name', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })

    const substatSets = ((data ?? []) as Omit<StandardSubstatSetRow, 'id' | 'note'>[]).map((row) => ({
        character_name: row.character_name,
        plan: (row.plan ?? { slots: [] }) as EchoPlan,
        updated_at: row.updated_at
    }))
    return Response.json({ substatSets, total: substatSets.length }, { headers: CORS_HEADERS })
}
