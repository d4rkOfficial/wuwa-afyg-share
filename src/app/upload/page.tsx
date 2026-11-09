import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import UploadForm from '@/components/wk/upload-form'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { CHAR_ELEMENTS } from '@/lib/data/char-elements.generated'

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
        const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
        if (!profile) redirect('/setup-username?redirect=/upload')
    }

    return (
        <WkRoot>
            <WkContainer className="wk-upload-page">
                <WkPageHead title="上传工程" sub="选择工具箱导出的 .json，填好分享信息后发布。" />
                <div className="wk-upload-body">
                    <UploadForm elements={CHAR_ELEMENTS as Record<string, string>} />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
