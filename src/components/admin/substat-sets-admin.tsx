'use client'

// 标准词条集管理（仅管理员）：5 个声骸部位编辑器 + JSON 导入/导出 + 已保存方案列表。
// 大部分角色的标准方案由工具箱本地生成，这里只需维护「特殊角色」的整份方案。

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import SubstatPlanJson from '@/components/admin/substat-plan-json'
import SubstatSlotEditor from '@/components/admin/substat-slot-editor'
import { toast } from '@/components/ui/toast'
import { deleteSubstatSet, upsertSubstatSet } from '@/lib/actions/substat-sets'
import { ECHO_MAX_TOTAL_COST, SUBSTAT_TOTAL_COUNT } from '@/lib/consts/echo-stats'
import { fetchEntityList } from '@/lib/upstream'
import { cloneEchoPlan, countPlanSubstats, createEmptyEchoPlan, validateEchoPlan } from '@/lib/utils/echo-plan'
import { formatDate, timeAgo } from '@/lib/utils/format'
import type { EchoPlan, EchoPlanSlot, StandardSubstatSetRow } from '@/lib/types/db'

interface Props {
    rows: StandardSubstatSetRow[]
}

const FIELD_CLASS =
    'w-full rounded-none border border-(--card-border) bg-(--input-bg) px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-(--accent)'

export default function SubstatSetsAdmin({ rows }: Props) {
    const router = useRouter()
    const [characterName, setCharacterName] = useState('')
    const [note, setNote] = useState('')
    const [plan, setPlan] = useState<EchoPlan>(() => createEmptyEchoPlan())
    // 载入/新建/导入后自增：强制槽位编辑器（含数值输入草稿）整体重挂载
    const [planVersion, setPlanVersion] = useState(0)
    const [jsonText, setJsonText] = useState('')
    const [loadedName, setLoadedName] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [characterList, setCharacterList] = useState<string[]>([])
    const [catalogError, setCatalogError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    // 角色目录：直连上游（与 Buff 集管理页同源），失败时降级为纯手输
    useEffect(() => {
        let alive = true
        fetchEntityList('character')
            .then((list) => {
                if (!alive) return
                const names = [...new Set(list.map((e) => e.name?.trim()).filter((n): n is string => !!n))]
                setCharacterList(names.sort((a, b) => a.localeCompare(b, 'zh')))
            })
            .catch((e) => {
                if (!alive) return
                setCatalogError(
                    `角色目录拉取失败（${e instanceof Error ? e.message : '未知错误'}），可直接输入角色名`
                )
            })
        return () => {
            alive = false
        }
    }, [])

    const planCheck = useMemo(() => validateEchoPlan(plan), [plan])
    const substatTotal = countPlanSubstats(plan)
    const costCombo = plan.slots.map((s) => s.cost).join(' + ')
    const totalCost = plan.slots.reduce((sum, s) => sum + s.cost, 0)

    // JSON 文本框实时校验（仅提示，不影响编辑器状态）
    const jsonStatus = useMemo(() => {
        const text = jsonText.trim()
        if (!text) return null
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch (e) {
            return { ok: false, text: `JSON 解析失败：${e instanceof Error ? e.message : '格式错误'}` }
        }
        const checked = validateEchoPlan(parsed)
        if (!checked.ok) return { ok: false, text: checked.error }
        return { ok: true, text: `校验通过：5 个部位 / 副词条 ${countPlanSubstats(checked.plan)} 条` }
    }, [jsonText])

    function resetEditor(next: EchoPlan, name: string, nextNote: string) {
        setPlan(next)
        setCharacterName(name)
        setNote(nextNote)
        setJsonText(JSON.stringify(next, null, 2))
        setPlanVersion((v) => v + 1)
    }

    function onNew() {
        setLoadedName(null)
        setConfirmDelete(null)
        resetEditor(createEmptyEchoPlan(), '', '')
        toast('已新建空方案', 'info')
    }

    function onLoad(row: StandardSubstatSetRow) {
        const checked = validateEchoPlan(row.plan)
        if (!checked.ok) {
            toast(`「${row.character_name}」的 plan 未通过校验（${checked.error}），已载入空方案`, 'error')
            resetEditor(createEmptyEchoPlan(), row.character_name, row.note ?? '')
        } else {
            resetEditor(cloneEchoPlan(checked.plan), row.character_name, row.note ?? '')
        }
        setLoadedName(row.character_name)
        setConfirmDelete(null)
    }

    function updateSlot(index: number, slot: EchoPlanSlot) {
        setPlan((prev) => ({ slots: prev.slots.map((s, i) => (i === index ? slot : s)) }))
    }

    function onSave() {
        const name = characterName.trim()
        if (!name) {
            toast('请先填写角色名', 'error')
            return
        }
        if (!planCheck.ok) {
            toast(planCheck.error, 'error')
            return
        }
        startTransition(async () => {
            const res = await upsertSubstatSet({ characterName: name, plan, note })
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            setLoadedName(name)
            toast(`已保存「${name}」的标准词条方案`, 'success')
            router.refresh()
        })
    }

    function onDelete(name: string) {
        startTransition(async () => {
            const res = await deleteSubstatSet(name)
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            setConfirmDelete(null)
            if (loadedName === name) setLoadedName(null)
            toast(`已删除「${name}」的标准词条方案`, 'success')
            router.refresh()
        })
    }

    function onExportJson() {
        setJsonText(JSON.stringify(plan, null, 2))
        toast('已导出当前方案到文本框', 'success')
    }

    function onImportJson() {
        let parsed: unknown
        try {
            parsed = JSON.parse(jsonText)
        } catch (e) {
            toast(`JSON 解析失败：${e instanceof Error ? e.message : '格式错误'}`, 'error')
            return
        }
        const checked = validateEchoPlan(parsed)
        if (!checked.ok) {
            toast(checked.error, 'error')
            return
        }
        setPlan(checked.plan)
        setPlanVersion((v) => v + 1)
        toast('已导入到编辑器，确认无误后点「保存」', 'success')
    }

    return (
        <div className="space-y-4">
            {/* 工具栏：角色名 + 备注 + 操作 */}
            <div className="flex flex-wrap items-end justify-between gap-3 mg-card p-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
                    <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-(--muted)">
                        角色名
                        <input
                            value={characterName}
                            onChange={(e) => setCharacterName(e.target.value)}
                            list="substat-character-options"
                            placeholder="输入或选择角色名（如：布兰特）"
                            className={FIELD_CLASS}
                        />
                        <datalist id="substat-character-options">
                            {characterList.map((n) => (
                                <option key={n} value={n} />
                            ))}
                        </datalist>
                    </label>
                    <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-(--muted)">
                        备注（仅管理页可见，不入公开 API）
                        <input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="例如：特殊词条配置来源 / 说明"
                            className={FIELD_CLASS}
                        />
                    </label>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button onClick={onNew} disabled={pending} className="toolbar-btn toolbar-btn-ghost">
                        <Icon icon="mdi:file-plus-outline" className="size-3.5" />
                        新建
                    </button>
                    <button
                        onClick={onSave}
                        disabled={pending || !characterName.trim()}
                        className="toolbar-btn toolbar-btn-primary"
                    >
                        <Icon
                            icon={pending ? 'mdi:loading' : 'mdi:content-save-outline'}
                            className={`size-3.5 ${pending ? 'animate-spin' : ''}`}
                        />
                        {pending ? '保存中…' : '保存'}
                    </button>
                    {loadedName && (
                        <button
                            onClick={() => onDelete(loadedName)}
                            disabled={pending}
                            className="inline-flex items-center gap-1 rounded-none border border-(--danger) bg-(--card) px-2.5 py-1.5 text-xs font-medium text-(--danger) transition-colors hover:bg-(--danger) hover:text-(--danger-fg) disabled:opacity-50"
                        >
                            <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                            删除当前
                        </button>
                    )}
                </div>
            </div>

            {/* 校验状态条 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-none border border-(--card-border) bg-(--card-hover) px-3 py-2 text-[11px]">
                <span className={substatTotal === SUBSTAT_TOTAL_COUNT ? 'text-(--success)' : 'text-(--danger)'}>
                    副词条合计 <span className="mg-num">{substatTotal}</span> /{' '}
                    <span className="mg-num">{SUBSTAT_TOTAL_COUNT}</span>
                </span>
                <span className={totalCost <= ECHO_MAX_TOTAL_COST ? 'text-(--muted)' : 'text-(--danger)'}>
                    cost：<span className="mg-num">{costCombo || '—'}</span>（合计{' '}
                    <span className="mg-num">{totalCost}</span> / 上限{' '}
                    <span className="mg-num">{ECHO_MAX_TOTAL_COST}</span>）
                </span>
                {planCheck.ok ? (
                    <span className="text-(--success)">✓ plan 校验通过，可保存</span>
                ) : (
                    <span className="text-(--danger)">✕ {planCheck.error}</span>
                )}
                {catalogError && <span className="text-(--muted)">{catalogError}</span>}
            </div>

            {/* 5 个部位编辑器 */}
            <div key={planVersion} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {plan.slots.map((slot, i) => (
                    <SubstatSlotEditor key={i} index={i} slot={slot} onChange={(s) => updateSlot(i, s)} />
                ))}
            </div>

            {/* JSON 导入 / 导出 */}
            <SubstatPlanJson
                value={jsonText}
                onChange={setJsonText}
                status={jsonStatus}
                onExport={onExportJson}
                onImport={onImportJson}
            />

            {/* 已保存方案列表 */}
            <div className="overflow-hidden mg-card">
                <div className="flex items-center justify-between border-b border-(--card-border) px-4 py-2.5">
                    <span className="flex items-center gap-2">
                        <Icon icon="mdi:database-outline" className="size-4 shrink-0 text-(--accent-text)" />
                        <span className="mg-title text-sm">已保存方案</span>
                        <span className="text-[11px] text-(--muted)">
                            共 <span className="mg-num text-(--fg)">{rows.length}</span> 个角色
                        </span>
                    </span>
                    <span className="mg-note">工具箱通过 /api/substat-sets 拉取</span>
                </div>
                {rows.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-(--muted)">暂无已保存方案</p>
                )}
                {rows.map((row) => {
                    const total = countPlanSubstats(row.plan)
                    const isLoaded = loadedName === row.character_name
                    return (
                        <div
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 border-b border-(--card-border) px-4 py-3 last:border-0"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-(--fg)">{row.character_name}</span>
                                    <span
                                        className={`rounded-none px-1.5 py-0.5 text-[10px] ${
                                            total === SUBSTAT_TOTAL_COUNT
                                                ? 'bg-(--accent) text-(--accent-fg)'
                                                : 'border border-(--danger) text-(--danger)'
                                        }`}
                                    >
                                        副词条 <span className="mg-num">{total}</span>
                                    </span>
                                    {isLoaded && (
                                        <span className="rounded-none bg-(--card-hover) px-1.5 py-0.5 text-[10px] text-(--muted)">
                                            编辑中
                                        </span>
                                    )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-(--muted)" title={row.updated_at}>
                                    更新于 <span className="mg-num">{formatDate(row.updated_at)}</span>（
                                    <span className="mg-num">{timeAgo(row.updated_at)}</span>）
                                    {row.note ? ` · ${row.note}` : ''}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    onClick={() => onLoad(row)}
                                    disabled={pending}
                                    className="toolbar-btn toolbar-btn-ghost"
                                >
                                    <Icon icon="mdi:pencil-outline" className="size-3.5" />
                                    载入编辑
                                </button>
                                {confirmDelete === row.id ? (
                                    <button
                                        onClick={() => onDelete(row.character_name)}
                                        disabled={pending}
                                        className="rounded-none border border-(--danger) bg-(--danger) px-3 py-1.5 text-xs text-(--danger-fg) transition-colors hover:bg-(--card) hover:text-(--danger) disabled:opacity-50"
                                    >
                                        确认删除
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDelete(row.id)}
                                        onBlur={() => setTimeout(() => setConfirmDelete(null), 2500)}
                                        disabled={pending}
                                        className="rounded-none border border-(--danger) bg-(--card) px-3 py-1.5 text-xs text-(--danger) transition-colors hover:bg-(--danger) hover:text-(--danger-fg) disabled:opacity-50"
                                    >
                                        删除
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
