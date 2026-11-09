import { WkContainer, WkLoading, WkRoot } from '@/design'

// 路由级加载态：转圈。
// 不用骨架屏 —— 骨架要先猜准目标页的版式，猜不准反而在内容到达时"跳一下"；
// 转圈只占一小块，位置稳定，也不会把已渲染的顶栏、页头清掉。
export default function Loading() {
    return (
        <WkRoot>
            <WkContainer>
                <WkLoading label="加载中…" large page />
            </WkContainer>
        </WkRoot>
    )
}
