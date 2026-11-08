import { redirect } from 'next/navigation'

// 编辑页已迁到 /edit/substat-sets；旧地址保留为跳转。
export default function LegacyAdminSubstatSetsPage() {
    redirect('/edit/substat-sets')
}
