'use client'

// 全站点阵背景的「聚光灯」：把光标位置写进 CSS 变量 --wk-dot-x / --wk-dot-y，
// body::after（见 globals.css）用一层跟着光标走的径向蒙版，把附近的点阵提亮。
// 只在精确指针（鼠标 / 触控板）上生效；每帧最多写一次样式，避免 pointermove 高频抖动。
import { useEffect } from 'react'

export default function WkDotField() {
    useEffect(() => {
        if (!window.matchMedia('(pointer: fine)').matches) return

        const root = document.documentElement
        let frame = 0
        let x = -600
        let y = -600

        const paint = () => {
            frame = 0
            root.style.setProperty('--wk-dot-x', `${x}px`)
            root.style.setProperty('--wk-dot-y', `${y}px`)
        }

        const onMove = (event: PointerEvent | MouseEvent) => {
            x = event.clientX
            y = event.clientY
            root.dataset.dotSpotlight = ''
            if (!frame) frame = requestAnimationFrame(paint)
        }

        // 指针离开窗口 / 窗口失焦：聚光灯淡出，不留一块亮斑在屏幕上
        const dim = () => {
            delete root.dataset.dotSpotlight
        }

        window.addEventListener('pointermove', onMove, { passive: true })
        window.addEventListener('blur', dim)
        document.addEventListener('pointerleave', dim)

        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('blur', dim)
            document.removeEventListener('pointerleave', dim)
            if (frame) cancelAnimationFrame(frame)
            delete root.dataset.dotSpotlight
            root.style.removeProperty('--wk-dot-x')
            root.style.removeProperty('--wk-dot-y')
        }
    }, [])

    return null
}
