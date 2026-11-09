import '@/design/wk-rows.css'
import '@/design/wk-overlay.css'
import '@/design/wk-plaza.css'
import '@/design/wk-editor.css'
import { notFound } from 'next/navigation'
import Specimen from './specimen'
import { sampleUsername } from '@/lib/data/sample-username'

// 只在开发期可访问：生产环境直接 404（避免设计系统样本页被外部看到）
export const dynamic = 'force-dynamic'

export const metadata = { title: '组件样本' }

export default function DevUiPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    // 样张里的作者名也走同一份随机逻辑：服务端取一次，客户端只渲染传下来的字符串
    return <Specimen sampleAuthor={sampleUsername()} />
}
