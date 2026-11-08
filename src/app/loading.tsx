import { WkContainer, WkRoot } from '@/design'

// 路由级加载态（新系统）
// 旧版是一枚 60vh 的大转圈，并且代码注释里明确写了「不用骨架屏，骨架形状对不上」。
// 实践里转圈的代价更大：它把整页清空，刊头、筛选条一起消失，随后内容再跳回来。
// 骨架只占版面、不清空导航，配合流式渲染观感明显更稳。形状取最保守的通用几行。
export default function Loading() {
    return (
        <WkRoot>
            <WkContainer>
                <div className="wk-skeleton-stack" style={{ paddingTop: 24 }}>
                    <div className="wk-skeleton" style={{ height: 30, width: '40%' }} />
                    <div className="wk-skeleton" style={{ height: 14, width: '60%' }} />
                    <div className="wk-skeleton" style={{ height: 36, width: '100%', maxWidth: 420 }} />
                    <div
                        style={{
                            display: 'grid',
                            gap: 12,
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'
                        }}
                    >
                        {[0, 1, 2].map((key) => (
                            <div key={key} className="wk-skeleton" style={{ height: 132 }} />
                        ))}
                    </div>
                </div>
            </WkContainer>
        </WkRoot>
    )
}
