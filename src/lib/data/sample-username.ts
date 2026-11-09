/**
 * @desc 示例用户名：从静态角色表里**随机**取一个角色名，拼成「<角色>手法大神」。
 *
 * 只在服务端调用（页面组件），把结果当字符串传给客户端组件。
 * 不要在客户端渲染期直接调用：服务端和客户端各随机一次 → hydration 不一致。
 */
import { CHAR_ELEMENTS } from '@/lib/data/char-elements.generated'

const SAMPLE_SUFFIX = '手法大神'
const FALLBACK_NAME = '长离'

/** @desc 真正随机的示例用户名，例如「珂莱塔手法大神」 */
export function sampleUsername(): string {
    const names = Object.keys(CHAR_ELEMENTS)
    if (names.length === 0) return `${FALLBACK_NAME}${SAMPLE_SUFFIX}`
    const name = names[Math.floor(Math.random() * names.length)] ?? FALLBACK_NAME
    return `${name}${SAMPLE_SUFFIX}`
}
