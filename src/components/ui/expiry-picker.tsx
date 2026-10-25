'use client'

// 过期时间快速选择：常用时长一键（+1/+7/+30/+90 天）、自定义日期、永久。
// 值统一是「YYYY-MM-DD」或空串（空串 = 永久），与后端 `expiresAt` 的拼接口径一致。
import { Icon } from '@iconify/react'

export interface ExpiryOption {
    /** @desc null = 永久；数字 = 从现在起 N 天 */
    days: number | null
    label: string
}

const QUICK: ExpiryOption[] = [
    { days: 1, label: '1 天' },
    { days: 7, label: '7 天' },
    { days: 30, label: '30 天' },
    { days: 90, label: '90 天' },
    { days: 365, label: '1 年' },
    { days: null, label: '永久' }
]

export function toDateInput(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export function daysFromNow(days: number): string {
    return toDateInput(new Date(Date.now() + days * 86400000))
}

/** @desc 日期输入框值 → 当天 23:59:59 的 ISO（东八区）；空串 = 永久（null） */
export function expiryDateToIso(date: string): string | null {
    return date ? `${date}T23:59:59.999+08:00` : null
}

interface Props {
    /** @desc YYYY-MM-DD 或空串（永久） */
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}

export default function ExpiryPicker({ value, onChange, disabled }: Props) {
    const isPermanent = !value
    // 与快捷项对齐：当前值等于某个快捷天数时高亮它
    const quickActive = (days: number | null): boolean => {
        if (days === null) return isPermanent
        return value === daysFromNow(days)
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
                {QUICK.map((opt) => {
                    const active = quickActive(opt.days)
                    return (
                        <button
                            key={opt.label}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(opt.days === null ? '' : daysFromNow(opt.days))}
                            className={`rounded-sm border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                                active
                                    ? 'border-(--accent) bg-(--accent) text-(--accent-fg)'
                                    : 'border-(--card-border) bg-(--card) text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            {opt.label}
                        </button>
                    )
                })}
                <span className="mx-0.5 h-4 w-px bg-(--card-border)" />
                <label className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1">
                    <Icon icon="mdi:calendar-outline" className="size-3.5 text-(--muted)" />
                    <input
                        type="date"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        className="bg-transparent text-[11px] outline-none"
                        title="自定义到期日期"
                    />
                </label>
            </div>
            <p className="text-[11px] text-(--muted)">
                {isPermanent ? '永久有效，不会自动失效。' : `到期日 ${value} 23:59（东八区）后分享链接自动失效。`}
                可随时在「我的工程」里改期。
            </p>
        </div>
    )
}
