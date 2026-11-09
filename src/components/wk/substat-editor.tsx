'use client'

// 标准词条集编辑台（新系统 · 单列）
// 结构变化：去掉「左侧已保存方案栏」，对象用顶部下拉切换；编辑区单列限宽 820；
// 底部粘性保存条（未脏时禁用保存）；载入 / 新建 / 清空 / 删除 一律走统一确认弹窗；
// 补上原先「有 state 却没有任何输入控件」的备注字段。
// 5 个部位的编辑器仍是既有实现（SubstatSlotEditor），只换外壳与流程。
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import SubstatSlotEditor from '@/components/admin/substat-slot-editor'
import {
    WkBadge,
    WkButton,
    WkConfirm,
    WkDialog,
    WkField,
    WkIconButton,
    WkInput,
    WkMenu,
    WkDropdown,
    WkSpacer,
    WkTextarea,
    WkToolbar,
    wkToast
} from '@/design'
import { deleteSubstatSet, upsertSubstatSet } from '@/lib/actions/substat-sets'
import { setSubstatSetLock } from '@/lib/actions/edit-locks'
import { ECHO_MAX_TOTAL_COST, SUBSTAT_TOTAL_COUNT } from '@/lib/consts/echo-stats'
import { fetchEntityList } from '@/lib/upstream'
import { countPlanSubstats, createEmptyEchoPlan, validateEchoPlan } from '@/lib/utils/echo-plan'
import { timeAgo } from '@/lib/utils/format'
import type { EchoPlan, EchoPlanSlot, StandardSubstatSetRow } from '@/lib/types/db'

type ConfirmKind = 'new' | 'clear' | 'delete' | 'load' | null

function snapshot(name: string, note: string, plan: EchoPlan): string {
    return JSON.stringify({ name: name.trim(), note: note.trim(), plan })
}

export default function SubstatEditor({
    rows,
    isAdmin,
    substatLocks
}: {
    rows: StandardSubstatSetRow[]
    isAdmin: boolean
    substatLocks: Record<string, boolean>
}) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const [name, setName] = useState('')
    const [note, setNote] = useState('')
    const [plan, setPlan] = useState<EchoPlan>(() => createEmptyEchoPlan())
    const [planVersion, setPlanVersion] = useState(0)
    const [baseline, setBaseline] = useState(() => snapshot('', '', createEmptyEchoPlan()))
    const [loaded, setLoaded] = useState<string | null>(null)

    const [confirm, setConfirm] = useState<ConfirmKind>(null)
    const [pendingRow, setPendingRow] = useState<StandardSubstatSetRow | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const [jsonOpen, setJsonOpen] = useState(false)
    const [jsonText, setJsonText] = useState('')
    const [characters, setCharacters] = useState<string[]>([])
    const [catalogError, setCatalogError] = useState<string | null>(null)

    // 角色目录（直连上游，失败时降级为手输）
    useEffect(() => {
        let alive = true
        fetchEntityList('character')
            .then((list) => {
                if (!alive) return
                const names = [...new Set(list.map((entry) => entry.name?.trim()).filter((value): value is string => !!value))]
                setCharacters(names.sort((a, b) => a.localeCompare(b, 'zh')))
            })
            .catch((error) => {
                if (!alive) return
                setCatalogError(`角色目录拉取失败（${error instanceof Error ? error.message : '未知错误'}），可直接输入角色名`)
            })
        return () => {
            alive = false
        }
    }, [])

    const planCheck = useMemo(() => validateEchoPlan(plan), [plan])
    const substatTotal = countPlanSubstats(plan)
    const totalCost = plan.slots.reduce((sum, slot) => sum + slot.cost, 0)
    const dirty = snapshot(name, note, plan) !== baseline
    const locked = loaded ? Boolean(substatLocks[loaded]) : false
    const canWrite = isAdmin || !locked

    function apply(next: EchoPlan, nextName: string, nextNote: string) {
        setPlan(next)
        setName(nextName)
        setNote(nextNote)
        setPlanVersion((value) => value + 1)
        setBaseline(snapshot(nextName, nextNote, next))
    }

    function loadRow(row: StandardSubstatSetRow) {
        apply(row.plan, row.character_name, row.note ?? '')
        setLoaded(row.character_name)
        setPendingRow(null)
        setConfirm(null)
    }

    function onSelect(value: string) {
        const row = rows.find((item) => item.character_name === value)
        if (!row) return
        if (dirty) {
            setPendingRow(row)
            setConfirm('load')
            return
        }
        loadRow(row)
    }

    function doNew() {
        apply(createEmptyEchoPlan(), '', '')
        setLoaded(null)
        setConfirm(null)
    }

    function doClear() {
        apply(createEmptyEchoPlan(), name, note)
        setConfirm(null)
    }

    function updateSlot(index: number, slot: EchoPlanSlot) {
        setPlan((prev) => ({ ...prev, slots: prev.slots.map((item, i) => (i === index ? slot : item)) }))
    }

    function onSave() {
        const target = name.trim()
        if (!target) {
            wkToast('请先填写角色名', 'error')
            return
        }
        if (!isAdmin && substatLocks[target]) {
            wkToast(`「${target}」已被管理员锁定，仅管理员可修改`, 'error')
            return
        }
        if (!planCheck.ok) {
            wkToast(planCheck.error, 'error')
            return
        }
        startTransition(async () => {
            const result = await upsertSubstatSet({ characterName: target, plan, note })
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            setLoaded(target)
            setBaseline(snapshot(target, note, plan))
            wkToast(`已保存「${target}」的标准词条方案`, 'ok')
            router.refresh()
        })
    }

    function onDelete() {
        if (!loaded) return
        const target = loaded
        startTransition(async () => {
            const result = await deleteSubstatSet(target)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            setConfirm(null)
            setLoaded(null)
            apply(createEmptyEchoPlan(), '', '')
            wkToast(`已删除「${target}」`, 'ok')
            router.refresh()
        })
    }

    function onToggleLock() {
        if (!loaded) return
        const target = loaded
        const next = !substatLocks[target]
        setMenuOpen(false)
        startTransition(async () => {
            const result = await setSubstatSetLock(target, next)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(next ? `已锁定「${target}」` : `已解锁「${target}」`, 'ok')
            router.refresh()
        })
    }

    function onImport() {
        let parsed: unknown
        try {
            parsed = JSON.parse(jsonText)
        } catch (error) {
            wkToast(`JSON 解析失败：${error instanceof Error ? error.message : '格式错误'}`, 'error')
            return
        }
        const checked = validateEchoPlan(parsed)
        if (!checked.ok) {
            wkToast(checked.error, 'error')
            return
        }
        apply(checked.plan, name, note)
        setJsonOpen(false)
        wkToast('已导入到编辑器，确认无误后点「保存」', 'ok')
    }

    return (
        <div className="wk-editor">
            <div className="wk-editor-head">
                <div className="wk-editor-picker">
                    <WkDropdown
                        value={loaded ?? ''}
                        ariaLabel="选择已保存的角色"
                        placeholder="选择已保存的角色…"
                        onChange={(next) => onSelect(next)}
                        options={rows.map((row) => ({
                            value: row.character_name,
                            label: `${row.character_name}${substatLocks[row.character_name] ? '（已锁定）' : ''}`
                        }))}
                    />
                </div>
                <WkButton size="sm" onClick={() => (dirty ? setConfirm('new') : doNew())}>
                    新建
                </WkButton>
                <WkBadge tone={dirty ? 'warn' : 'ok'}>{dirty ? '未保存' : '已保存'}</WkBadge>
                {loaded && locked && <WkBadge tone="accent">仅管理员可改</WkBadge>}
                <WkSpacer />
                {/* 条目级编辑锁：和 Buff 编辑台同一个位置语义（谁在看谁的那把锁），不再藏进「更多」 */}
                {isAdmin && loaded && (
                    <WkIconButton
                        size="sm"
                        variant="quiet"
                        label={locked ? '解锁该角色（当前仅管理员可改）' : '锁定该角色（仅管理员可改）'}
                        aria-pressed={locked}
                        disabled={pending}
                        onClick={onToggleLock}
                    >
                        <Icon
                            icon={locked ? 'mdi:lock-outline' : 'mdi:lock-open-variant-outline'}
                            className="size-4"
                            style={locked ? { color: 'var(--wk-accent-text)' } : undefined}
                            aria-hidden="true"
                        />
                    </WkIconButton>
                )}
                <div className="wk-pop">
                    <WkButton size="sm" variant="quiet" aria-haspopup="menu" onClick={() => setMenuOpen((value) => !value)}>
                        更多
                    </WkButton>
                    {menuOpen && (
                        <WkMenu
                            onClose={() => setMenuOpen(false)}
                            items={[
                                {
                                    key: 'export',
                                    label: '导出当前方案 JSON',
                                    onSelect: () => {
                                        setJsonText(JSON.stringify(plan, null, 2))
                                        setJsonOpen(true)
                                    }
                                },
                                {
                                    key: 'import',
                                    label: '从 JSON 导入',
                                    onSelect: () => {
                                        setJsonText('')
                                        setJsonOpen(true)
                                    }
                                },
                                ...(loaded
                                    ? [{ key: 'delete', label: '删除该角色方案', danger: true, onSelect: () => setConfirm('delete') }]
                                    : [])
                            ]}
                        />
                    )}
                </div>
            </div>

            <div className="wk-card wk-card-pad" style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <WkField label="角色名" hint={catalogError ?? '可从下拉里选，也可以直接输入'}>
                        <WkInput
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            list="wk-character-catalog"
                            placeholder="例：布兰特"
                            disabled={Boolean(loaded && !canWrite)}
                        />
                        <datalist id="wk-character-catalog">
                            {characters.map((item) => (
                                <option key={item} value={item} />
                            ))}
                        </datalist>
                    </WkField>
                    <WkField label="备注" hint="可选，展示在浏览页的角色条目上">
                        <WkInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="例：仅计算本体" />
                    </WkField>
                </div>

                <WkToolbar>
                    <WkBadge tone={totalCost <= ECHO_MAX_TOTAL_COST ? 'default' : 'danger'}>
                        cost {totalCost}/{ECHO_MAX_TOTAL_COST}
                    </WkBadge>
                    <WkBadge tone={substatTotal === SUBSTAT_TOTAL_COUNT ? 'ok' : 'warn'}>
                        副词条 {substatTotal}/{SUBSTAT_TOTAL_COUNT}
                    </WkBadge>
                    {!planCheck.ok && <span className="wk-meta" style={{ color: 'var(--wk-danger)' }}>{planCheck.error}</span>}
                    <span className="wk-meta">共 {plan.slots.length} 个部位</span>
                </WkToolbar>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                {plan.slots.map((slot, index) => (
                    <SubstatSlotEditor
                        key={`${planVersion}-${index}`}
                        index={index}
                        slot={slot}
                        onChange={(next) => updateSlot(index, next)}
                    />
                ))}
            </div>

            <div className="wk-actionbar">
                <span className="wk-meta">
                    {loaded
                        ? `已载入「${loaded}」· 更新于 ${timeAgo(rows.find((row) => row.character_name === loaded)?.updated_at ?? '')}`
                        : '新方案（未保存）'}
                </span>
                <WkSpacer />
                <WkButton size="sm" variant="quiet" onClick={() => setConfirm('clear')} disabled={pending}>
                    清空
                </WkButton>
                <WkButton size="sm" variant="primary" onClick={onSave} disabled={pending || !dirty || !canWrite}>
                    {pending ? '保存中…' : '保存'}
                </WkButton>
            </div>

            <WkDialog
                open={jsonOpen}
                onClose={() => setJsonOpen(false)}
                width={620}
                title="方案 JSON"
                footer={
                    <>
                        <WkButton variant="quiet" onClick={() => setJsonOpen(false)}>
                            关闭
                        </WkButton>
                        <WkButton variant="primary" onClick={onImport} disabled={!jsonText.trim()}>
                            导入到编辑器
                        </WkButton>
                    </>
                }
            >
                <WkField label="粘贴 JSON" hint="导入后需再点「保存」才会写库；导出会把当前编辑器内容写进这个框">
                    <WkTextarea
                        value={jsonText}
                        onChange={(event) => setJsonText(event.target.value)}
                        rows={12}
                        placeholder='{ "slots": [ … ] }'
                    />
                </WkField>
            </WkDialog>

            <WkConfirm
                open={confirm === 'new'}
                onClose={() => setConfirm(null)}
                title="放弃当前改动，新建方案？"
                description="编辑器里未保存的内容会丢失。"
                confirmLabel="放弃并新建"
                busy={pending}
                onConfirm={doNew}
            />
            <WkConfirm
                open={confirm === 'clear'}
                onClose={() => setConfirm(null)}
                title="清空 5 个部位？"
                description="会把当前方案恢复为空模板（角色名与备注保留）。"
                confirmLabel="清空"
                busy={pending}
                onConfirm={doClear}
            />
            <WkConfirm
                open={confirm === 'load'}
                onClose={() => {
                    setConfirm(null)
                    setPendingRow(null)
                }}
                title={`切换到「${pendingRow?.character_name ?? ''}」？`}
                description="当前未保存的改动会丢失。"
                confirmLabel="放弃并切换"
                busy={pending}
                onConfirm={() => pendingRow && loadRow(pendingRow)}
            />
            <WkConfirm
                open={confirm === 'delete'}
                onClose={() => setConfirm(null)}
                title={`删除「${loaded ?? ''}」的标准词条方案？`}
                description="删除后工具箱将不再同步到这个角色的方案，且不可撤销。"
                confirmLabel="永久删除"
                busy={pending}
                onConfirm={onDelete}
            />
        </div>
    )
}
