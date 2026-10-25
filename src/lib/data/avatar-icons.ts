// 角色头像表（服务端）：给「用户名 → 角色头像」提供素材。
//
// 上游 `character.json` 不小，且同一进程内内容不变：这里用**模块级 Promise 缓存**，
// 一个 worker 只拉一次；失败不缓存（下次请求重试），失败期间页面降级为无头像。
import { getProvider } from '@/lib/upstream'

let pending: Promise<Record<string, string>> | null = null

export function getAvatarIcons(): Promise<Record<string, string>> {
    if (!pending) {
        pending = getProvider()
            .getCharacterIcons()
            .catch(() => {
                // 上游挂了：清掉缓存让下一个请求重试；本次返回空表（调用方降级）
                pending = null
                return {} as Record<string, string>
            })
    }
    return pending
}
