'use client'

// Buff 集结构迁移面板（v1 → v2：乘区贡献条目列表 + 条件分层挂载）。
//
// 工坊的 Buff 集曾经是「一个乘区一条 + 实例级单值链/阶条件」，工具箱改成
// 「乘区贡献条目列表（同乘区可多条、各带自己的条件）+ 链阶数组 + 属性/类型下放到乘区」后，
// 老数据需要在库内升级一次（见 supabase/migrations/0005_buff_set_v2.sql）。
//
// 这个面板做三件事：
//   1. 显示迁移状态（是否已升级、升级时间、当时的报告）；
//   2. 「预演」：在服务端按同一套规则 dry-run 现有行，列出会改什么、有多少行（不写库）；
//   3. 「执行迁移」：调用数据库函数（幂等、单事务），失败时把报告里的错误给用户看。
//
// 迁移是**幂等**的：新增的行、或「还原了旧快照后」的残留，都可以再点一次执行迁移补上。

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'
import {
    getBuffMigrationStatus,
    previewBuffMigration,
    runBuffMigration,
    type BuffMigrationStatus
} from '@/lib/actions/buff-migrations'
import { BUFF_SET_CHANGE_LABELS, type BuffSetChangeKey, type BuffSetMigrationReport } from '@/lib/buff-snapshots/migrate-v2'

interface Props {
    isAdmin: boolean
}

const fmtTime = (iso: string | null): string => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', { hour12: false })
}

const REPORT_KEYS: BuffSetChangeKey[] = [
    'condition',
    'buff_set[].condition(实例级条件下放)',
    'buff_set[].zoneId(旧 id 重映射)',
    'buff_set[].override(覆盖唯一/该乘区不支持)',
    'buff_set[].ref(层数类乘区不支持引用)',
    'buff_set[].ref(非法引用已剔除)',
    'buff_set[].zoneId(未知乘区已剔除)',
    'scope(非法值兜底 team)',
    'exclusive'
]

export default function BuffMigrationPanel({ isAdmin }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState<BuffMigrationStatus | null>(null)
    const [statusError, setStatusError] = useState<string | null>(null)
    const [report, setReport] = useState<BuffSetMigrationReport | null>(null)
    const [previewing, setPreviewing] = useState(false)
    const [confirmRun, setConfirmRun] = useState(false)
    const [pending, startTransition] = useTransition()

    async function loadStatus() {
        const res = await getBuffMigrationStatus()
        if (res.error) {
            setStatusError(res.error)
            return
        }
        setStatusError(null)
        setStatus(res.data ?? null)
    }

    useEffect(() => {
        // 只在挂载时读一次状态；执行迁移后由 onRun 手动刷新。
        // 放进微任务里发起，避免在 effect 体内同步 setState（会触发级联渲染）。
        let cancelled = false
        queueMicrotask(() => {
            if (!cancelled) void loadStatus()
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function onPreview() {
        setPreviewing(true)
        const res = await previewBuffMigration()
        setPreviewing(false)
        if (res.error || !res.data) {
            toast(res.error ?? '预演失败', 'error')
            return
        }
        setReport(res.data.runtime)
    }

    function onRun() {
        setConfirmRun(false)
        startTransition(async () => {
            const res = await runBuffMigration()
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            const buffs = res.data?.buffs as { changed?: number; total?: number; alreadyV2?: number } | null
            const snaps = res.data?.snapshots as { snapshotsChanged?: number; snapshots?: number } | null
            toast(
                `迁移完成：Buff 集 ${buffs?.changed ?? 0}/${buffs?.total ?? 0} 行改动，快照 ${snaps?.snapshotsChanged ?? 0}/${snaps?.snapshots ?? 0} 个改动`,
                'success'
            )
            setReport(null)
            await loadStatus()
            router.refresh()
        })
    }

    const appliedReport = status?.report ?? null
    const appliedAt = fmtTime(status?.appliedAt ?? null)
    const changeEntries = report
        ? REPORT_KEYS.filter((k) => (report.changeCounts[k] ?? 0) > 0).map((k) => ({ key: k, count: report.changeCounts[k] ?? 0 }))
        : []

    return (
        <div className="mg-card">
      <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-(--card-hover)"
            >
                <Icon
                    icon={open ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                    className="size-4 shrink-0 text-(--muted)"
                />
                <Icon icon="mdi:database-sync-outline" className="size-4 shrink-0 text-(--accent-text)" />
                <span className="mg-title text-sm">Buff 集结构迁移</span>
                <span className="mg-note text-[10px] text-(--muted)">
                    v1 → v2：乘区贡献条目列表 + 条件分层挂载
                </span>
                <span className="flex-1" />
                {statusError ? (
                    <span className="mg-num shrink-0 text-[10px] text-(--danger)">{statusError}</span>
                ) : status?.applied ? (
                    <span className="mg-num shrink-0 rounded-none bg-(--accent) px-1.5 py-0.5 text-[10px] text-(--accent-fg)">
                        已迁移 · {appliedAt}
                    </span>
                ) : (
                    <span className="mg-num shrink-0 rounded-none border border-(--warning) px-1.5 py-0.5 text-[10px] text-(--warning)">
                        {status ? '未迁移' : '状态读取中…'}
                    </span>
                )}
            </button>

            {open && (
                <div className="space-y-3 border-t border-(--card-border) px-4 py-3">
                    <p className="mg-note text-[11px] leading-relaxed text-(--muted)">
                        迁移把老结构升级到与工具箱一致：<span className="text-(--fg)">旧链/阶单值条件</span>升级为
                        <span className="text-(--fg)"> chains/refinements 数组</span>（链阶互斥，只保留链）；
                        <span className="text-(--fg)">实例级属性/类型条件</span>下放到每个乘区条目；
                        旧乘区 id（customFinalDmg / customFinalDmgMul）重映射；覆盖按「同乘区唯一」规范化。
                        内容是<span className="text-(--fg)">无损保留</span>的（子句只升级不删除），迁移
                        <span className="text-(--fg)">幂等</span>，快照也会一并升级，还原旧版本后可以再跑一次补上。
                    </p>

                    {appliedReport && (
                        <div className="rounded-none border border-(--card-border) bg-(--input-bg) px-3 py-2">
                            <div className="mb-1 text-[11px] text-(--muted)">
                                上次迁移报告（{appliedAt}）
                            </div>
                            <div className="mg-num flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-(--fg)">
                                <span>总行数 {String(appliedReport.total ?? '—')}</span>
                                <span>改动 {String(appliedReport.changed ?? '—')}</span>
                                <span>已是 v2 {String(appliedReport.alreadyV2 ?? '—')}</span>
                                <span>空乘区行 {String(appliedReport.emptyZoneRows ?? '—')}</span>
                                <span>快照 {String(appliedReport.snapshots ?? '—')}</span>
                                <span>快照改动 {String(appliedReport.snapshotsChanged ?? '—')}</span>
                            </div>
                        </div>
                    )}

                    {report && (
                        <div className="space-y-2 rounded-none border border-(--card-border) bg-(--input-bg) px-3 py-2">
                            <div className="mg-num flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-(--fg)">
                                <span>总行数 {report.total}</span>
                                <span>需改动 {report.changed}</span>
                                <span>已是 v2 {report.alreadyV2}</span>
                                <span>空乘区行 {report.emptyZoneRows}</span>
                            </div>
                            {changeEntries.length === 0 ? (
                                <div className="text-[11px] text-(--success)">没有需要改动的行，库内已全部是 v2。</div>
                            ) : (
                                <ul className="space-y-0.5">
                                    {changeEntries.map((e) => (
                                        <li key={e.key} className="flex items-center justify-between gap-2 text-[11px] text-(--muted)">
                                            <span className="truncate">{BUFF_SET_CHANGE_LABELS[e.key]}</span>
                                            <span className="mg-num shrink-0 text-(--fg)">{e.count} 行</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {report.sample.length > 0 && (
                                <details className="text-[11px] text-(--muted)">
                                    <summary className="cursor-pointer select-none">示例（前 {report.sample.length} 行）</summary>
                                    <ul className="mt-1 space-y-0.5">
                                        {report.sample.map((s) => (
                                            <li key={s.entity} className="truncate">
                                                <span className="text-(--fg)">{s.entity}</span>
                                                <span className="ml-1">
                                                    → {s.changes.map((c) => BUFF_SET_CHANGE_LABELS[c]).join('、')}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onPreview}
                            disabled={previewing || pending}
                            className="toolbar-btn toolbar-btn-ghost disabled:opacity-50"
                        >
                            <Icon
                                icon={previewing ? 'mdi:loading' : 'mdi:eye-outline'}
                                className={previewing ? 'size-3.5 animate-spin' : 'size-3.5'}
                            />
                            预演（不写库）
                        </button>
                        {isAdmin ? (
                            confirmRun ? (
                                <button
                                    type="button"
                                    onClick={onRun}
                                    disabled={pending}
                                    className="toolbar-btn border border-(--warning) text-(--warning) disabled:opacity-50"
                                >
                                    <Icon icon={pending ? 'mdi:loading' : 'mdi:alert-outline'} className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
                                    确认执行迁移
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setConfirmRun(true)}
                                    onBlur={() => setTimeout(() => setConfirmRun(false), 3000)}
                                    className="toolbar-btn toolbar-btn-primary"
                                >
                                    <Icon icon="mdi:database-sync-outline" className="size-3.5" />
                                    执行迁移
                                </button>
                            )
                        ) : (
                            <span className="toolbar-btn toolbar-btn-ghost select-none text-(--muted)">
                                <Icon icon="mdi:lock-outline" className="size-3.5" />
                                仅管理员可执行
                            </span>
                        )}
                        {report && report.changed > 0 && !confirmRun && isAdmin && (
                            <span className="mg-note text-[10px] text-(--muted)">
                                建议先「更新快照」再迁移，迁移后可对比版本差异
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
