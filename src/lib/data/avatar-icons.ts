// 角色 / 武器 / 声骸 / 套装的头像表（服务端）：给「实体列表图标」与「用户名 → 角色头像」提供素材。
//
// 上游 `*.json` 不小，且同一进程内内容不变：用**模块级 Promise 缓存**，一个 worker 只拉一次；
// 失败不缓存（下次请求重试），失败期间页面降级为无图标。
import { getProvider } from '@/lib/upstream'

export interface EntityIconMaps {
    character: Record<string, string>
    weapon: Record<string, string>
    echo: Record<string, string>
    set: Record<string, string>
}

export const EMPTY_ENTITY_ICONS: EntityIconMaps = {
    character: {},
    weapon: {},
    echo: {},
    set: {}
}

let entityPending: Promise<EntityIconMaps> | null = null

/** @desc 四类实体的名字 → 图标地址（任一失败都降级为空表，不影响页面渲染） */
export function getEntityIcons(): Promise<EntityIconMaps> {
    if (!entityPending) {
        const provider = getProvider()
        entityPending = Promise.all([
            provider.getCharacterIcons(),
            provider.getWeaponIcons(),
            provider.getEchoIcons(),
            provider.getEchoSetIcons()
        ])
            .then(([character, weapon, echo, set]) => ({ character, weapon, echo, set }))
            .catch(() => {
                // 上游挂了：清缓存让下个请求重试
                entityPending = null
                return { ...EMPTY_ENTITY_ICONS }
            })
    }
    return entityPending
}

/** @desc 角色头像表（用户名 → 角色头像的素材；与实体图标共用同一份缓存） */
export async function getAvatarIcons(): Promise<Record<string, string>> {
    return (await getEntityIcons()).character
}
