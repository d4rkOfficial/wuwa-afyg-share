import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
    const { code } = await params
    const supabase = await createClient()

    const { data } = await supabase
        .from('projects')
        .select('id, title, project_json')
        .eq('code', code)
        .maybeSingle()

    if (!data) return new Response('分享已失效', { status: 404 })

    await supabase.rpc('bump_counter', { p_id: data.id, p_col: 'clones' })

    const text = JSON.stringify(data.project_json)
    const filename = encodeURIComponent(`${data.title}.json`)
    return new Response(text, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename*=UTF-8''${filename}`
        }
    })
}
