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
        <div className="mx-auto max-w-5xl space-y-5">
            <div className="border-b pb-4 mg-hairline">
                <h1 className="mg-title-xl text-2xl md:text-3xl">上传工程</h1>
                <p className="mt-1 text-sm leading-relaxed text-(--muted)">
                    选择工具箱导出的 .json，填写分享信息后发布。文件原样保存，
                    「下载 = 上传的文件」；标题 / 简介 / 标签 / 有效期都能在发布前改。
                </p>
            </div>
            <UploadForm />
        </div>
    )
}
