import { redirect } from 'next/navigation'

// 编辑页已迁到 /edit/buff-sets（AI 工作台独立到 /agent/*）；旧地址保留为跳转，避免收藏/分享链接失效。
export default function LegacyAdminBuffSetsPage() {
    redirect('/edit/buff-sets')
}
