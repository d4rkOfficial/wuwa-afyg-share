import { WkContainer, WkLoading, WkRoot } from '@/design'

export default function Loading() {
    return (
        <WkRoot>
            <WkContainer>
                <WkLoading label="加载我的工程…" large page />
            </WkContainer>
        </WkRoot>
    )
}
