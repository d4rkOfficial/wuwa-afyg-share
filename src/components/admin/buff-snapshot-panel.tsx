'use client'

// Buff 集快照面板（根 + 版本链）：
//   - 更新快照：无根 → 创建根（全量复制）；有根 → 追加版本（只存差异），需二次确认
//   - 快照列表：根不可删；仅最新版本可删除；任意项可对比 / 恢复
//   - 备注自动拉取工具箱实例最新游戏版本（GET /api/v1/version/latest）作为默认值与 hint
// 全部仅管理员（服务端校验）。

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'
import {
    saveBuffSnapshot,
    getBuffSnapshotDiff,
    restoreBuffSnapshot,
    deleteBuffSnapshot,
    listBuffSnapshots,
    type BuffSnapshotView
} from '@/lib/actions/buff-snapshots'
import type { SnapshotDiff } from '@/lib/buff-snapshots/diff'
import { BUFF_ENTITY_LABELS } from '@/lib/consts/buff-zones'
import { timeAgo } from '@/lib/utils/format'
import type { BuffSetRow } from '@/lib/types/db'
import { getProvider } from '@/lib/upstream/provider/registry'

interface Props {
    
}

interface ZoneChange {
    zoneId: string
    kind: 'add' | 'remove' | 'change'
    oldValue?: string
    newValue?: string
}

// 逐 zone 对比两行（old 为快照值，new 为当前值）
function zoneChanges(oldRow: BuffSetRow, newRow: BuffSetRow): ZoneChange[] {
    const out: ZoneChange[] = []
    const oldMap = new Map(oldRow.buff_set.map((z) => [z.zoneId, z]))
    const newMap = new Map(newRow.buff_set.map((z) => [z.zoneId, z]))
    for (const [zoneId, z] of newMap) {
        const oldZ = oldMap.get(zoneId)
        if (!oldZ) out.push({ zoneId, kind: 'add', newValue: String(z.value) })
        else if (oldZ.value !== z.value) {
            out.push({ zoneId, kind: 'change', oldValue: String(oldZ.value), newValue: String(z.value) })
        }
    }
    for (const [zoneId, z] of oldMap) {
        if (!newMap.has(zoneId)) out.push({ zoneId, kind: 'remove', oldValue: String(z.value) })
    }
    return out
}

function rowLabel(row: BuffSetRow): string {
    const typeLabel = BUFF_ENTITY_LABELS[row.entity_type as keyof typeof BUFF_ENTITY_LABELS] ?? row.entity_type
    return `${typeLabel} · ${row.entity_name} · ${row.buff_name}`
}

const KIND_CLS = {
    add: 'text-(--success)',
    remove: 'text-(--danger)',
    change: 'text-(--warning)'
} as const

export default function BuffSnapshotPanel() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [snapshots, setSnapshots] = useState<BuffSnapshotView[]>([])
    const [note, setNote] = useState('')
    const [versionHint, setVersionHint] = useState('')
    const lastAutoVersion = useRef('')
    const [pending, startTransition] = useTransition()
    const [loading, setLoading] = useState(false)
    const [diff, setDiff] = useState<SnapshotDiff | null>(null)
    const [diffTarget, setDiffTarget] = useState<string>('')
    const [diffLoading, setDiffLoading] = useState(false)
    const [confirmUpdate, setConfirmUpdate] = useState(false)
    const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    const hasRoot = snapshots.some((s) => s.isRoot)
    // 版本序号：按创建顺序 v1、v2…
    const versionNo = new Map(snapshots.filter((s) => !s.isRoot).map((s, i) => [s.id, i + 1]))

    function run(fn: () => Promise<unknown>, successMsg?: string) {
        startTransition(async () => {
            const res = await fn()
            const r = res as { error?: string; data?: { restored?: number; message?: string; mode?: string } } | undefined
            if (r?.error) {
                toast(r.error, 'error')
                return
            }
            if (r?.data?.restored !== undefined) toast(`已恢复到快照（${r.data.restored} 行）`, 'success')
            else if (r?.data?.message) toast(r.data.message, 'success')
            else if (successMsg) toast(successMsg, 'success')
            setConfirmUpdate(false)
            setConfirmRestoreId(null)
            setConfirmDeleteId(null)
            await loadList()
            router.refresh()
        })
    }

    async function loadList() {
        setLoading(true)
        const res = await listBuffSnapshots()
        setLoading(false)
        if (res.error) {
            toast(res.error, 'error')
            return
        }
        setSnapshots(res.data?.snapshots ?? [])
    }

    // 拉取工具箱实例最新游戏版本：默认填入备注（用户手动改过的不覆盖），并作为 hint
    async function fetchLatestVersion() {
        try {
            const version = await getProvider().getLatestVersion()
            if (!version) return
            setVersionHint(version)
            if (!note.trim() || note.trim() === lastAutoVersion.current) {
                lastAutoVersion.current = version
                setNote(version)
            }
        } catch {
            // CORS / 网络失败：静默降级，保留默认 hint
        }
    }

    function openPanel() {
        setOpen(true)
        setConfirmUpdate(false)
        setConfirmRestoreId(null)
        setConfirmDeleteId(null)
        setDiff(null)
        setDiffTarget('')
        void loadList()
        void fetchLatestVersion()
    }

    function onSaveSnapshot() {
        run(() => saveBuffSnapshot(note))
    }

    function onRestore(id: string) {
        run(() => restoreBuffSnapshot(id))
    }

    function onDelete(id: string) {
        run(() => deleteBuffSnapshot(id))
    }

    function onDiff(id: string, label: string) {
        setDiffLoading(true)
        startTransition(async () => {
            const res = await getBuffSnapshotDiff(id)
            setDiffLoading(false)
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            setDiff(res.data?.diff ?? null)
            setDiffTarget(label)
        })
    }

    const diffTotal = diff ? diff.added.length + diff.modified.length + diff.removed.length : 0

    return (
        <>
            <button onClick={openPanel} className="toolbar-btn toolbar-btn-ghost" title="Buff 集快照（仅管理员）">
                <span className="flex items-center gap-1.5">
                    <Icon icon="mdi:camera-outline" className="size-4" />
                    快照
                    {hasRoot && <span className="ml-1 rounded bg-(--accent) px-1 py-0.5 text-[9px] text-(--accent-fg)">有</span>}
                </span>
                <Icon icon="mdi:camera" className="size-4" />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="fixed inset-0 bg-black/60 " onClick={() => setOpen(false)} />
                    <div className="relative mx-auto my-8 w-[calc(100vw-2rem)] max-w-2xl rounded-none border-2 border-(--card-border) bg-(--card) p-4 ">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-semibold text-(--fg)">Buff 集快照</span>
                            <button onClick={() => setOpen(false)} className="rounded p-1 text-(--muted) hover:text-(--fg)">
                                <Icon icon="mdi:close" className="size-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {/* 备注输入（自动填入工具箱最新游戏版本） */}
                            <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                快照备注（可选）
                                <input
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    maxLength={100}
                                    placeholder={versionHint ? `${versionHint} · 游戏最新版本` : '例如：v1.2 版本基线'}
                                    className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
                                />
                                {versionHint && (
                                    <span className="text-[10px] text-(--muted)">
                                        已自动填入工具箱最新版本 {versionHint}（清空后可手动修改）
                                    </span>
                                )}
                            </label>

                            {/* 更新快照 */}
                            <button
                                onClick={() => setConfirmUpdate(true)}
                                disabled={pending}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-none px-3 py-2 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all  disabled:opacity-50"
                                title={hasRoot ? '以当前 Buff 集状态追加一个新版本（只存差异）' : '原原本本复制整个 Buff 集作为根快照'}
                            >
                                <Icon icon="mdi:camera-plus-outline" className="size-4" />
                                {hasRoot ? '更新快照（追加新版本）' : '更新快照（创建根）'}
                            </button>

                            {/* 快照列表（最新在上，根在底部） */}
                            <div className="rounded-none border-2 border-(--card-border)">
                                <div className="flex items-center justify-between border-b-2 border-(--card-border) px-3 py-2 text-xs text-(--muted)">
                                    <span>快照列表{loading && <Icon icon="mdi:loading" className="ml-1 inline size-3 animate-spin" />}</span>
                                    <span>{hasRoot ? `根 + ${versionNo.size} 个版本` : '暂无根快照'}</span>
                                </div>
                                {snapshots.length === 0 && (
                                    <p className="px-3 py-4 text-center text-xs text-(--muted)">
                                        暂无快照。点击上方「更新快照」创建根（全量复制当前 Buff 集）。
                                    </p>
                                )}
                                <div className="max-h-64 space-y-1 overflow-y-auto p-2">
                                    {[...snapshots].reverse().map((s) => {
                                        const isRoot = s.isRoot
                                        const label = isRoot ? '根快照' : `v${versionNo.get(s.id)}`
                                        return (
                                            <div key={s.id} className="rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2.5 py-2">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                                    <span
                                                        className={`inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 text-[10px] ${
                                                            isRoot ? 'bg-(--accent) text-(--accent-fg)' : 'bg-(--card-hover) text-(--muted)'
                                                        }`}
                                                    >
                                                        <Icon icon={isRoot ? 'mdi:home-variant-outline' : 'mdi:source-branch'} className="size-3" />
                                                        {label}
                                                        {isRoot && <span className="opacity-70">· 全量基准</span>}
                                                    </span>
                                                    {s.isLatest && !isRoot && (
                                                        <span className="rounded border-2 border-(--success) px-1.5 py-0.5 text-[10px] text-(--success)">最新</span>
                                                    )}
                                                    <span className="text-(--muted)">{s.createdBy ?? '未知'} · {timeAgo(s.createdAt)}</span>
                                                    <span className="flex-1" />
                                                    <button
                                                        onClick={() => onDiff(s.id, label)}
                                                        disabled={pending || diffLoading}
                                                        className="rounded px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--accent-text) disabled:opacity-50"
                                                    >
                                                        对比
                                                    </button>
                                                    {confirmRestoreId === s.id ? (
                                                        <button
                                                            onClick={() => onRestore(s.id)}
                                                            disabled={pending}
                                                            className="rounded border-2 border-(--danger) bg-(--danger) transition-colors hover:bg-(--card) hover:text-(--danger) px-2 py-0.5 text-[11px] text-white  disabled:opacity-50"
                                                        >
                                                            确认恢复
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmRestoreId(s.id)}
                                                            onBlur={() => setTimeout(() => setConfirmRestoreId(null), 2500)}
                                                            disabled={pending}
                                                            className="rounded px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--danger) disabled:opacity-50"
                                                            title={isRoot ? '恢复为根快照（删除全部版本）' : '恢复到此版本（删除比其新的版本）'}
                                                        >
                                                            恢复
                                                        </button>
                                                    )}
                                                    {s.canDelete ? (
                                                        confirmDeleteId === s.id ? (
                                                            <button
                                                                onClick={() => onDelete(s.id)}
                                                                disabled={pending}
                                                                className="rounded border-2 border-(--danger) bg-(--danger) transition-colors hover:bg-(--card) hover:text-(--danger) px-2 py-0.5 text-[11px] text-white  disabled:opacity-50"
                                                            >
                                                                确认删除
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setConfirmDeleteId(s.id)}
                                                                onBlur={() => setTimeout(() => setConfirmDeleteId(null), 2500)}
                                                                disabled={pending}
                                                                className="rounded px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--danger) disabled:opacity-50"
                                                            >
                                                                删除
                                                            </button>
                                                        )
                                                    ) : (
                                                        !isRoot && (
                                                            <span className="text-[10px] text-(--muted)/50" title="仅最新版本可删除">
                                                                不可删
                                                            </span>
                                                        )
                                                    )}
                                                </div>
                                                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-(--muted)">
                                                    <Icon icon="mdi:note-text-outline" className="size-3 shrink-0" />
                                                    <span className="truncate">{s.note || '（无备注）'}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 差异展示 */}
                            {diff && (
                                <div className="max-h-80 overflow-y-auto rounded-none border-2 border-(--card-border)">
                                    <div className="sticky top-0 border-b-2 border-(--card-border) bg-(--card) px-3 py-2 text-xs text-(--muted)">
                                        当前 vs {diffTarget}：{' '}
                                        <span className="text-(--success)">新增 {diff.added.length}</span>
                                        {' / '}
                                        <span className="text-(--warning)">修改 {diff.modified.length}</span>
                                        {' / '}
                                        <span className="text-(--danger)">删除 {diff.removed.length}</span>
                                    </div>
                                    <div className="space-y-1 p-2 text-xs">
                                        {diffTotal === 0 && <p className="px-2 py-3 text-center text-(--muted)">无差异，当前状态与快照一致</p>}
                                        {diff.added.map((row, i) => (
                                            <div key={`a${i}`} className="flex items-start gap-1.5 rounded px-2 py-1">
                                                <span className={`shrink-0 font-bold ${KIND_CLS.add}`}>+</span>
                                                <span className="text-(--fg)">{rowLabel(row)}</span>
                                            </div>
                                        ))}
                                        {diff.modified.map((m, i) => (
                                            <div key={`m${i}`} className="rounded px-2 py-1">
                                                <div className="flex items-start gap-1.5">
                                                    <span className={`shrink-0 font-bold ${KIND_CLS.change}`}>~</span>
                                                    <span className="text-(--fg)">{rowLabel(m.new)}</span>
                                                </div>
                                                <div className="mt-1 space-y-0.5 pl-4 font-mono text-[10px]">
                                                    {zoneChanges(m.old, m.new).map((z) => (
                                                        <div key={z.zoneId} className={KIND_CLS[z.kind]}>
                                                            {z.kind === 'add' && `+ ${z.zoneId}: ${z.newValue}`}
                                                            {z.kind === 'remove' && `- ${z.zoneId}: ${z.oldValue}`}
                                                            {z.kind === 'change' && `~ ${z.zoneId}: ${z.oldValue} → ${z.newValue}`}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {diff.removed.map((r, i) => (
                                            <div key={`r${i}`} className="flex items-start gap-1.5 rounded px-2 py-1">
                                                <span className={`shrink-0 font-bold ${KIND_CLS.remove}`}>-</span>
                                                <span className="text-(--muted) line-through">{rowLabel(r.old)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex justify-end border-t-2 border-(--card-border) pt-3">
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-none px-4 py-1.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
                            >
                                完成
                            </button>
                        </div>
                    </div>

                    {/* 更新快照二次确认弹窗 */}
                    {confirmUpdate && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                            <div
                                className="absolute inset-0 bg-black/60 "
                                onClick={() => setConfirmUpdate(false)}
                            />
                            <div className="relative w-full max-w-sm rounded-none border-2 border-(--card-border) bg-(--card) p-5 ">
                                <div className="flex items-center gap-2">
                                    <Icon icon="mdi:camera-iris" className="size-5 text-(--accent-text)" />
                                    <h3 className="text-sm font-semibold">{hasRoot ? '追加新版本快照？' : '创建根快照？'}</h3>
                                </div>
                                <p className="mt-2 text-sm text-(--muted)">
                                    {hasRoot ? (
                                        <>
                                            将以当前 Buff 集状态<strong className="text-(--fg)">追加一个新版本</strong>
                                            （只保存与最新快照的差异，历史版本全部保留）。
                                        </>
                                    ) : (
                                        <>
                                            将<strong className="text-(--fg)">原原本本复制整个 Buff 集</strong>
                                            作为根快照（全量基准，之后的新版本只存差异）。
                                        </>
                                    )}
                                </p>
                                {note.trim() && (
                                    <p className="mt-2 text-xs text-(--muted)">
                                        备注：<span className="text-(--fg)">{note.trim()}</span>
                                    </p>
                                )}
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => setConfirmUpdate(false)}
                                        className="rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={onSaveSnapshot}
                                        disabled={pending}
                                        className="inline-flex items-center gap-1 rounded-none px-3 py-1.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg)  disabled:opacity-50"
                                    >
                                        <Icon icon={pending ? 'mdi:loading' : 'mdi:camera-plus-outline'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                                        确认更新
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
