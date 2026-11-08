import Link from 'next/link'
import { WkContainer, WkEmpty, WkRoot } from '@/design'

export default function NotFound() {
    return (
        <WkRoot>
            <WkContainer>
                <WkEmpty
                    title="分享已失效或不存在"
                    hint="该分享链接可能已过期、被作者删除或从未存在。"
                    action={
                        <Link href="/" className="wk-btn wk-btn--sm">
                            返回广场
                        </Link>
                    }
                />
            </WkContainer>
        </WkRoot>
    )
}
