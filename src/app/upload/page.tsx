import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import UploadForm from '@/components/upload-form'
import { createClient, hasEnv } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: '上传工程'
}

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
    if (hasEnv()) {
        const supabase = await createClient()
        const {
            data: { user }
        } = await supabase.auth.getUser()
        if (!user) redirect('/login?redirect=/upload')
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()
        if (!profile) redirect('/setup-username?redirect=/upload')
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">上传工程</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    从椰果工具箱导出工程 JSON，分享给社区使用。
                </p>
            </div>
            <UploadForm />
        </div>
    )
}
