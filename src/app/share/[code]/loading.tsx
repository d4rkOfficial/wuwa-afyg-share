import { WkContainer, WkLoading, WkRoot } from '@/design'

// 分享页加载态：转圈（与全站一致，不再用骨架屏）
export default function Loading() {
    return (
        <WkRoot>
            <WkContainer>
                <WkLoading label="加载分享页…" large page />
            </WkContainer>
        </WkRoot>
    )
}
