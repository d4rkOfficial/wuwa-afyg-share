'use client'

// Buff 集快照面板：左侧快照链 + 追加快照，右侧详情与「新增 / 删除 / 修改」三页差异。
// 全部仅管理员（服务端校验）。

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { wkToast } from '@/design'
import { isImeComposing } from '@/lib/keyboard'
import {
    saveBuffSnapshot,
    getBuffSnapshotDiff,
    restoreBuffSnapshot,
    deleteBuffSnapshot,
    squashBuffSnapshot,
    listBuffSnapshots,
    type BuffSnapshotView
} from '@/lib/actions/buff-snapshots'
import type { SnapshotDiff } from '@/lib/buff-snapshots/diff'
import { BUFF_ENTITY_LABELS } from '@/lib/consts/buff-zones'
import { timeAgo } from '@/lib/utils/format'
import type { BuffSetRow } from '@/lib/types/db'
import { getProvider } from '@/lib/upstream/provider/registry'

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
    add: 'text-(--wk-ok)',
    remove: 'text-(--wk-danger)',
    change: 'text-(--wk-warn)'
} as const

type DiffTab = 'added' | 'removed' | 'modified'

export default function BuffSnapshotPanel() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [snapshots, setSnapshots] = useState<BuffSnapshotView[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [note, setNote] = useState('')
    const [appendOpen, setAppendOpen] = useState(false)
    const [versionHint, setVersionHint] = useState('')
    const lastAutoVersion = useRef('')
    const [pending, startTransition] = useTransition()
    const [loading, setLoading] = useState(false)
    const [diff, setDiff] = useState<SnapshotDiff | null>(null)
    const [diffLoading, setDiffLoading] = useState(false)
    const [diffTab, setDiffTab] = useState<DiffTab>('added')
    const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [confirmSquash, setConfirmSquash] = useState(false)

    const hasRoot = snapshots.some((s) => s.isRoot)
    const latest = snapshots[snapshots.length - 1] ?? null
    const versionNo = new Map(snapshots.filter((s) => !s.isRoot).map((s, i) => [s.id, i + 1]))
    const labelOf = (s: BuffSnapshotView): string => (s.isRoot ? '根快照' : `v${versionNo.get(s.id) ?? '?'}`)
    const latestName = latest ? latest.note.trim() || labelOf(latest) : ''
    const selected = snapshots.find((s) => s.id === selectedId) ?? null

    const diffCounts = diff
        ? {
              added: diff.added.length + diff.folders.added.length,
              removed: diff.removed.length + diff.folders.removed.length,
              modified: diff.modified.length + diff.folders.modified.length
          }
        : { added: 0, removed: 0, modified: 0 }

    function run(fn: () => Promise<unknown>, successMsg?: string, selectLatest = false) {
        startTransition(async () => {
            const res = await fn()
            const r = res as { error?: string; data?: { restored?: number; message?: string; mode?: string } } | undefined
            if (r?.error) {
                wkToast(r.error, 'error')
                return
            }
            if (r?.data?.restored !== undefined) wkToast(`已恢复到快照（${r.data.restored} 行）`, 'success')
            else if (r?.data?.message) wkToast(r.data.message, 'success')
            else if (successMsg) wkToast(successMsg, 'success')
            setConfirmRestoreId(null)
            setConfirmDeleteId(null)
            setConfirmSquash(false)
            const list = await loadList(selectLatest)
            if (selectLatest) {
                const id = list[list.length - 1]?.id
                if (id) loadDiff(id)
            } else {
                setDiff(null)
            }
            router.refresh()
        })
    }

    async function loadList(selectLatest = false) {
        setLoading(true)
        const res = await listBuffSnapshots()
        setLoading(false)
        if (res.error) {
            wkToast(res.error, 'error')
            return []
        }
        const list = res.data?.snapshots ?? []
        setSnapshots(list)
        setSelectedId((prev) =>
            selectLatest ? (list[list.length - 1]?.id ?? null) : prev && list.some((s) => s.id === prev) ? prev : (list[list.length - 1]?.id ?? null)
        )
        return list
    }

    /** @desc 选中快照并计算「当前 vs 该快照」的差异（事件驱动，避免 effect 里 setState 级联渲染） */
    function loadDiff(id: string) {
        setDiff(null)
        setDiffLoading(true)
        startTransition(async () => {
            const res = await getBuffSnapshotDiff(id)
            setDiffLoading(false)
            if (res.error) {
                wkToast(res.error, 'error')
                setDiff(null)
                return
            }
            setDiff(res.data?.diff ?? null)
            const d = res.data?.diff
            if (d) {
                if (d.added.length + d.folders.added.length > 0) setDiffTab('added')
                else if (d.modified.length + d.folders.modified.length > 0) setDiffTab('modified')
                else if (d.removed.length + d.folders.removed.length > 0) setDiffTab('removed')
            }
        })
    }

    function selectSnapshot(id: string) {
        setSelectedId(id)
        loadDiff(id)
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

    useEffect(() => {
        void loadList()
    }, [])

    // 与 WkDialog 同一套行为：Esc 关闭 + 打开期间锁住页面滚动
    useEffect(() => {
        if (!open) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKeyDown = (event: KeyboardEvent) => {
            if (isImeComposing(event)) return
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open])

    function openPanel() {
        setOpen(true)
        setAppendOpen(false)
        setConfirmRestoreId(null)
        setConfirmDeleteId(null)
        setConfirmSquash(false)
        setDiff(null)
        void (async () => {
            const list = await loadList()
            const id = list[list.length - 1]?.id
            if (id) loadDiff(id)
        })()
        void fetchLatestVersion()
    }

    function onSaveSnapshot() {
        if (!note.trim()) {
            wkToast('请填写快照名称', 'error')
            return
        }
        setAppendOpen(false)
        run(() => saveBuffSnapshot(note), undefined, true)
    }

    const tabs: Array<{ key: DiffTab; label: string; icon: string; tone: string }> = [
        { key: 'added', label: '新增', icon: 'mdi:plus-circle-outline', tone: 'text-(--wk-ok)' },
        { key: 'removed', label: '删除', icon: 'mdi:minus-circle-outline', tone: 'text-(--wk-danger)' },
        { key: 'modified', label: '修改', icon: 'mdi:pencil-circle-outline', tone: 'text-(--wk-warn)' }
    ]

    return (
        <>
            <button
                onClick={openPanel}
                className="wk-btn wk-btn--ghost max-w-56 min-w-0"
                title={latest ? `快照 · 最新：${latest.note || labelOf(latest)}` : 'Buff 集快照（仅管理员）'}
            >
                <Icon icon="mdi:camera-outline" className="size-4 shrink-0" />
                <span className="shrink-0">快照</span>
                {latest && (
                    <span
                        className="ml-1 min-w-0 max-w-32 truncate rounded-sm border border-(--wk-line) bg-(--wk-input) px-1.5 py-0.5 text-[10px] text-(--wk-fg-3)"
                        title={latest.note || labelOf(latest)}
                    >
                        {latestName}
                    </span>
                )}
            </button>

            {open && (
                /* 用设计系统的遮罩与弹层外壳：与「打开实体」一致（--wk-scrim 半透明底 + 细边浮层），
                   顺带拿到 Esc 关闭与滚动锁；之前手写的 bg-(--overlay) 引的是不存在的令牌，
                   等于没有遮罩，页面内容会透上来。 */
                <div
            className="wk wk-mask"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) setOpen(false)
            }}
        >
                    <div
                        className="wk-dialog"
                        style={{ width: 'min(96vw, 1040px)' }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Buff 集快照"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex shrink-0 items-center justify-between border-b border-(--wk-line) px-4 py-3">
                            <span className="flex items-center gap-2 wk-title text-sm">
                                <Icon icon="mdi:camera-outline" className="size-4 shrink-0 text-(--wk-accent-text)" />
                                Buff 集快照
                            </span>
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-sm p-1 text-(--wk-fg-3) hover:bg-(--wk-s2) hover:text-(--wk-fg)"
                            >
                                <Icon icon="mdi:close" className="size-5" />
                            </button>
                        </div>

                        <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
                            {/* 左：快照列表 + 追加快照 */}
                            <aside className="flex min-h-0 flex-col border-b border-(--wk-line) md:border-b-0 md:border-r">
                                <div className="flex shrink-0 items-center justify-between border-b border-(--wk-line) px-3 py-2">
                                    <span className="flex items-center gap-1.5 text-xs text-(--wk-fg-3)">
                                        <Icon icon="mdi:history" className="size-3.5 shrink-0 text-(--wk-accent-text)" />
                                        快照列表
                                        {loading && <Icon icon="mdi:loading" className="size-3 animate-spin" />}
                                    </span>
                                    <button
                                        onClick={() => setAppendOpen((v) => !v)}
                                        className="inline-flex items-center gap-1 rounded-sm border border-(--wk-accent) bg-(--wk-accent) px-2 py-1 text-[11px] text-(--wk-accent-fg) transition-colors hover:brightness-110"
                                    >
                                        <Icon icon="mdi:camera-plus-outline" className="size-3.5" />
                                        追加快照
                                    </button>
                                </div>

                                {appendOpen && (
                                    <div className="shrink-0 space-y-2 border-b border-(--wk-line) bg-(--wk-input) px-3 py-2">
                                        <input
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            maxLength={100}
                                            placeholder={versionHint ? `${versionHint} · 游戏最新版本` : '快照名称'}
                                            className="w-full rounded-sm border border-(--wk-line) bg-(--wk-s1) px-2 py-1.5 text-xs outline-none focus:border-(--wk-accent)"
                                        />
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setAppendOpen(false)}
                                                className="rounded-sm px-2 py-1 text-[11px] text-(--wk-fg-3) hover:text-(--wk-fg)"
                                            >
                                                取消
                                            </button>
                                            <button
                                                onClick={onSaveSnapshot}
                                                disabled={pending || !note.trim()}
                                                className="inline-flex items-center gap-1 rounded-sm border border-(--wk-line) bg-(--wk-fg) px-2.5 py-1 text-[11px] text-(--wk-bg) hover:bg-(--wk-s1) disabled:opacity-50"
                                            >
                                                <Icon
                                                    icon={pending ? 'mdi:loading' : 'mdi:check'}
                                                    className={`size-3.5 ${pending ? 'animate-spin' : ''}`}
                                                />
                                                {hasRoot ? '追加版本' : '创建根'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                                    {snapshots.length === 0 && (
                                        <p className="px-2 py-6 text-center text-xs text-(--wk-fg-3)">
                                            暂无快照，点击「追加快照」创建根
                                        </p>
                                    )}
                                    {[...snapshots].reverse().map((s) => {
                                        const active = s.id === selectedId
                                        return (
                                            <button
                                                key={s.id}
                                                onClick={() => selectSnapshot(s.id)}
                                                className={`w-full rounded-sm border px-2.5 py-2 text-left transition-colors ${
                                                    active
                                                        ? 'border-(--wk-accent) bg-(--wk-accent)/10'
                                                        : 'border-(--wk-line) bg-(--wk-input) hover:border-(--wk-accent)/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={`rounded-sm px-1.5 py-0.5 text-[10px] ${
                                                            s.isRoot
                                                                ? 'bg-(--wk-accent) text-(--wk-accent-fg)'
                                                                : 'bg-(--wk-s2) text-(--wk-fg-3)'
                                                        }`}
                                                    >
                                                        {labelOf(s)}
                                                    </span>
                                                    {s.isLatest && !s.isRoot && (
                                                        <span className="rounded-sm border border-(--wk-ok) px-1 py-0.5 text-[9px] text-(--wk-ok)">
                                                            最新
                                                        </span>
                                                    )}
                                                    <span className="ml-auto text-[10px] text-(--wk-fg-3)">
                                                        {timeAgo(s.createdAt)}
                                                    </span>
                                                </div>
                                                <p className="mt-1 truncate text-xs text-(--wk-fg)" title={s.note || '（无备注）'}>
                                                    {s.note || '（无备注）'}
                                                </p>
                                            </button>
                                        )
                                    })}
                                </div>

                                {hasRoot && versionNo.size > 0 && (
                                    <div className="shrink-0 border-t border-(--wk-line) p-2">
                                        <button
                                            onClick={() => setConfirmSquash(true)}
                                            disabled={pending}
                                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-(--wk-line) px-2 py-1.5 text-[11px] text-(--wk-fg-3) transition-colors hover:border-(--wk-warn) hover:text-(--wk-warn) disabled:opacity-50"
                                        >
                                            <Icon icon="mdi:call-merge" className="size-3.5" />
                                            合并到根（清空版本链）
                                        </button>
                                    </div>
                                )}
                            </aside>

                            {/* 右：快照详情 + 增删改 tabs */}
                            <section className="flex min-h-0 flex-col">
                                {!selected ? (
                                    <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-(--wk-fg-3)">
                                        选择左侧快照查看详情
                                    </div>
                                ) : (
                                    <>
                                        <div className="shrink-0 border-b border-(--wk-line) px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-sm bg-(--wk-accent) px-1.5 py-0.5 text-[10px] text-(--wk-accent-fg)">
                                                    {labelOf(selected)}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm text-(--wk-fg)">
                                                    {selected.note || '（无备注）'}
                                                </span>
                                                {selected.isLatest && <span className="text-[10px] text-(--wk-ok)">最新</span>}
                                            </div>
                                            <p className="mt-1 text-[10px] text-(--wk-fg-3)">
                                                {selected.createdBy ?? '未知'} · {timeAgo(selected.createdAt)} ·{' '}
                                                {selected.isRoot ? '全量基准' : '版本差异'}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                {confirmRestoreId === selected.id ? (
                                                    <button
                                                        onClick={() => run(() => restoreBuffSnapshot(selected.id))}
                                                        disabled={pending}
                                                        className="rounded-sm border border-(--wk-danger) bg-(--wk-danger) px-2.5 py-1 text-[11px] text-(--wk-accent-fg) disabled:opacity-50"
                                                    >
                                                        确认恢复
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmRestoreId(selected.id)}
                                                        className="rounded-sm border border-(--wk-line) px-2.5 py-1 text-[11px] text-(--wk-fg-3) hover:text-(--wk-danger)"
                                                    >
                                                        恢复到此快照
                                                    </button>
                                                )}
                                                {selected.canDelete &&
                                                    (confirmDeleteId === selected.id ? (
                                                        <button
                                                            onClick={() => run(() => deleteBuffSnapshot(selected.id))}
                                                            disabled={pending}
                                                            className="rounded-sm border border-(--wk-danger) bg-(--wk-danger) px-2.5 py-1 text-[11px] text-(--wk-accent-fg) disabled:opacity-50"
                                                        >
                                                            确认删除
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmDeleteId(selected.id)}
                                                            className="rounded-sm border border-(--wk-line) px-2.5 py-1 text-[11px] text-(--wk-fg-3) hover:text-(--wk-danger)"
                                                        >
                                                            删除版本
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1 border-b border-(--wk-line) px-3 py-2">
                                            {tabs.map((tab) => {
                                                const count = diffCounts[tab.key]
                                                return (
                                                    <button
                                                        key={tab.key}
                                                        onClick={() => setDiffTab(tab.key)}
                                                        className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1 text-[11px] transition-colors ${
                                                            diffTab === tab.key
                                                                ? 'bg-(--wk-accent) text-(--wk-accent-fg)'
                                                                : 'text-(--wk-fg-3) hover:bg-(--wk-s2) hover:text-(--wk-fg)'
                                                        }`}
                                                    >
                                                        <Icon icon={tab.icon} className="size-3.5" />
                                                        {tab.label}
                                                        <span className="wk-numeral opacity-70">{count}</span>
                                                    </button>
                                                )
                                            })}
                                            <span className="ml-auto text-[10px] text-(--wk-fg-3)">
                                                {diffLoading && <Icon icon="mdi:loading" className="mr-1 inline size-3 animate-spin" />}
                                                当前 vs {labelOf(selected)}
                                            </span>
                                        </div>

                                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                                            {!diff || diffLoading ? (
                                                <p className="py-8 text-center text-xs text-(--wk-fg-3)">
                                                    {diffLoading ? '正在计算差异…' : '选择快照后计算差异'}
                                                </p>
                                            ) : diffCounts[diffTab] === 0 ? (
                                                <p className="py-8 text-center text-xs text-(--wk-fg-3)">该分类无变化</p>
                                            ) : (
                                                <div className="space-y-1 text-xs">
                                                    {diffTab === 'added' && (
                                                        <>
                                                            {diff.added.map((row, i) => (
                                                                <div key={`a${i}`} className="flex items-start gap-1.5 rounded-sm bg-(--wk-input) px-2 py-1.5">
                                                                    <span className={`shrink-0 font-black ${KIND_CLS.add}`}>+</span>
                                                                    <span className="text-(--wk-fg)">{rowLabel(row)}</span>
                                                                </div>
                                                            ))}
                                                            {diff.folders.added.map((folder, i) => (
                                                                <div key={`fa${i}`} className="flex items-start gap-1.5 rounded-sm bg-(--wk-input) px-2 py-1.5">
                                                                    <span className={`shrink-0 font-black ${KIND_CLS.add}`}>+</span>
                                                                    <span className="text-(--wk-fg)">
                                                                        {folder.entity_name} · 文件夹 {folder.name}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                    {diffTab === 'removed' && (
                                                        <>
                                                            {diff.removed.map((r, i) => (
                                                                <div key={`r${i}`} className="flex items-start gap-1.5 rounded-sm bg-(--wk-input) px-2 py-1.5">
                                                                    <span className={`shrink-0 font-black ${KIND_CLS.remove}`}>-</span>
                                                                    <span className="text-(--wk-fg-3) line-through">{rowLabel(r.old)}</span>
                                                                </div>
                                                            ))}
                                                            {diff.folders.removed.map((folder, i) => (
                                                                <div key={`fr${i}`} className="flex items-start gap-1.5 rounded-sm bg-(--wk-input) px-2 py-1.5">
                                                                    <span className={`shrink-0 font-black ${KIND_CLS.remove}`}>-</span>
                                                                    <span className="text-(--wk-fg-3) line-through">
                                                                        {folder.old.entity_name} · 文件夹 {folder.old.name}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                    {diffTab === 'modified' && (
                                                        <>
                                                            {diff.modified.map((m, i) => (
                                                                <div key={`m${i}`} className="rounded-sm bg-(--wk-input) px-2 py-1.5">
                                                                    <div className="flex items-start gap-1.5">
                                                                        <span className={`shrink-0 font-black ${KIND_CLS.change}`}>~</span>
                                                                        <span className="text-(--wk-fg)">{rowLabel(m.new)}</span>
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
                                                            {diff.folders.modified.map((folder, i) => (
                                                                <div key={`fm${i}`} className="rounded-sm bg-(--wk-input) px-2 py-1.5">
                                                                    <div className="flex items-start gap-1.5">
                                                                        <span className={`shrink-0 font-black ${KIND_CLS.change}`}>~</span>
                                                                        <span className="text-(--wk-fg)">
                                                                            {folder.new.entity_name} · 文件夹 {folder.old.name} → {folder.new.name}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </section>
                        </div>
                    </div>

                    {/* 合并到根确认 */}
                    {confirmSquash && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                            <div
                                className="absolute inset-0 bg-(--wk-scrim)"
                                onPointerDown={() => setConfirmSquash(false)}
                            />
                            <div className="relative w-full max-w-sm wk-panel p-5">
                                <div className="wk-section">
                                    <Icon icon="mdi:call-merge" className="size-5 shrink-0 text-(--wk-warn)" />
                                    <h3 className="wk-title text-sm">合并快照到根？</h3>
                                </div>
                                <p className="mt-2 text-sm text-(--wk-fg-3)">
                                    以最新快照的重建状态替换根基准，清空全部 <span className="wk-numeral">{versionNo.size}</span>{' '}
                                    个版本节点。当前 Buff 集不变。
                                </p>
                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        onClick={() => setConfirmSquash(false)}
                                        className="rounded-sm border border-(--wk-line) bg-(--wk-s1) px-3 py-1.5 text-sm text-(--wk-fg-3) hover:text-(--wk-fg)"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={() => run(() => squashBuffSnapshot(note))}
                                        disabled={pending}
                                        className="inline-flex items-center gap-1 rounded-sm border border-(--wk-warn) bg-(--wk-warn) px-3 py-1.5 text-sm font-medium text-(--wk-accent-fg) hover:bg-(--wk-s1) hover:text-(--wk-warn) disabled:opacity-50"
                                    >
                                        <Icon
                                            icon={pending ? 'mdi:loading' : 'mdi:call-merge'}
                                            className={`size-4 ${pending ? 'animate-spin' : ''}`}
                                        />
                                        确认合并
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
