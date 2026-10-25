import LoadingIndicator from '@/components/ui/loading-indicator'

// 路由级加载态：统一用大号旋转图标（不再用骨架屏 —— 骨架的形状永远和真实内容对不上，
// 反而把「正在加载」这件事藏了起来）
export default function Loading() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center">
            <LoadingIndicator label="加载中…" />
        </div>
    )
}
