import { WkContainer, WkRoot } from '@/design'

// 路由级加载态（新系统）：用骨架而不是整页转圈 —— 骨架能保住版面，转圈会清空整页
export default function Loading() {
    return (
        <WkRoot>
            <WkContainer>
                <div className="wk-skeleton-stack" style={{ paddingTop: 24, maxWidth: 720 }}>
                    <div className="wk-skeleton" style={{ height: 28, width: '55%' }} />
                    <div className="wk-skeleton" style={{ height: 14, width: '35%' }} />
                    <div className="wk-skeleton" style={{ height: 14, width: '80%' }} />
                    <div className="wk-skeleton" style={{ height: 180 }} />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
