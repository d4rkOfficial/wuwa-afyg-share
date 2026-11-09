/**
 * @desc 输入法「组合中」判定：中文 / 日文输入法在候选阶段按下的键，应用层一律不该消费。
 *
 * 为什么必须判：拼音输入时确认候选词用的是 **Enter**，而我们的输入框普遍把 Enter 绑成
 * 「提交 / 发送 / 加标签」并 `preventDefault()` —— 结果就是把输入法的确认键吃掉，
 * 候选窗关不掉、中英文切换（Shift）也跟着不响应，用户看到的就是「输入框里输入法坏了」。
 *
 * 三个来源都要看：
 * - 原生事件的 `isComposing`（Chrome / Firefox / Safari 现代版）；
 * - React 合成事件上的 `isComposing`（与原生同步，部分版本只透传在这里）；
 * - 旧 Chromium / Safari 在组合期间只给 `keyCode === 229`。
 */
type KeyLike = {
    nativeEvent?: { isComposing?: boolean } | null
    isComposing?: boolean
    keyCode?: number
}

export function isImeComposing(event: KeyLike | null | undefined): boolean {
    if (!event) return false
    if (event.nativeEvent && event.nativeEvent.isComposing) return true
    if (event.isComposing) return true
    return event.keyCode === 229
}
