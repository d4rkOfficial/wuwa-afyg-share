/**
 * @desc 示例用户名：「<随机角色>手法大神」。
 *
 * 角色名来自**上游实时数据**（`getAvatarIcons()` 的键就是当前角色表），仓库里不存角色名单，
 * 新角色上线后示例名自动跟上。
 *
 * 只在服务端调用（页面组件），把结果当字符串传给客户端组件；
 * 不要在客户端渲染期直接调用：服务端和客户端各随机一次 → hydration 不一致。
 */
import { getAvatarIcons } from '@/lib/data/avatar-icons'

const SAMPLE_SUFFIX = '手法大神'
/** @desc 上游不可用时的通用占位（不是角色名，避免暗示某个角色存在） */
const FALLBACK_NAME = '巡游者'

/** @desc 真正随机的示例用户名，例如「珂莱塔手法大神」 */
export async function sampleUsername(): Promise<string> {
    const icons = await getAvatarIcons()
    const names = Object.keys(icons)
    if (names.length === 0) return `${FALLBACK_NAME}${SAMPLE_SUFFIX}`
    const name = names[Math.floor(Math.random() * names.length)] ?? FALLBACK_NAME
    return `${name}${SAMPLE_SUFFIX}`
}
