import type { Metadata } from 'next'
import UploadForm from '@/components/upload-form'

export const metadata: Metadata = {
    title: '上传工程'
}

export default function UploadPage() {
    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">上传工程</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    从椰果工具箱导出工程 JSON，分享给社区使用。
                </p>
            </div>
            <UploadForm />
        </div>
    )
}
