'use client'

// 标准词条集 · 单个角色的编辑台（一个标签页 = 一个角色）。
// 结构对齐 Buff 编辑台：左侧是**五个声骸部位**的列表，右侧是选中部位的编辑框，
// 底部一条保存条。角色名来自「添加角色」，不再手输。
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import SubstatSlotEditor from '@/components/admin/substat-slot-editor'
import { WkBadge, WkButton, WkConfirm, WkField, WkIconButton, WkInput, WkSpacer, wkToast } from '@/design'
import { deleteSubstatSet, upsertSubstatSet } from '@/lib/actions/substat-sets'
import { setSubstatSetLock } from '@/lib/actions/edit-locks'
import { ECHO_MAX_TOTAL_COST, SUBSTAT_TOTAL_COUNT, mainStatShort } from '@/lib/consts/echo-stats'
import { countPlanSubstats, createEmptyEchoPlan, validateEchoPlan } from '@/lib/utils/echo-plan'
import { timeAgo } from '@/lib/utils/format'
import type { EchoPlan, EchoPlanSlot, StandardSubstatSetRow } from '@/lib/types/db'

function snapshot(note: string, plan: EchoPlan): string {
    return JSON.stringify({ note: note.trim(), plan })
}

export default function SubstatCharacterEditor({
    characterName,
    initialRow,
    isAdmin,
    locked,
    onDirtyChange,
    onDeleted
}: {
    characterName: string
    /** @desc 已保存的方案；没有就是新建 */
    initialRow?: StandardSubstatSetRow
    isAdmin: boolean
    /** @desc 该角色是否被条目级编辑锁锁住 */
    locked: boolean
    onDirtyChange?: (dirty: boolean) => void
    onDeleted?: () => void
}) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const [note, setNote] = useState(initialRow?.note ?? '')
    const [plan, setPlan] = useState<EchoPlan>(() => initialRow?.plan ?? createEmptyEchoPlan())
    const [baseline, setBaseline] = useState(() => snapshot(initialRow?.note ?? '', initialRow?.plan ?? createEmptyEchoPlan()))
    const [activeSlot, setActiveSlot] = useState(0)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const canWrite = isAdmin || !locked
    const dirty = snapshot(note, plan) !== baseline
    const planCheck = useMemo(() => validateEchoPlan(plan), [plan])
    const substatTotal = countPlanSubstats(plan)
    const totalCost = plan.slots.reduce((sum, slot) => sum + slot.cost, 0)

    // 脏状态由「当前内容 vs 基线」推导，再同步给外层的标签栏（撤回到原样时也会回到干净态）
    const dirtyRef = useRef<boolean | null>(null)
    useEffect(() => {
        if (dirtyRef.current === dirty) return
        dirtyRef.current = dirty
        onDirtyChange?.(dirty)
    }, [dirty, onDirtyChange])

    function updateSlot(index: number, slot: EchoPlanSlot) {
        setPlan((prev) => ({ ...prev, slots: prev.slots.map((item, i) => (i === index ? slot : item)) }))
    }

    function onSave() {
        if (!canWrite) {
            wkToast(`「${characterName}」已被管理员锁定，仅管理员可修改`, 'error')
            return
        }
        if (!planCheck.ok) {
            wkToast(planCheck.error, 'error')
            return
        }
        startTransition(async () => {
            const result = await upsertSubstatSet({ characterName, plan, note })
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            setBaseline(snapshot(note, plan))
            onDirtyChange?.(false)
            wkToast(`已保存「${characterName}」的标准词条方案`, 'ok')
            router.refresh()
        })
    }

    function onDelete() {
        startTransition(async () => {
            const result = await deleteSubstatSet(characterName)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            setConfirmDelete(false)
            wkToast(`已删除「${characterName}」`, 'ok')
            onDirtyChange?.(false)
            onDeleted?.()
            router.refresh()
        })
    }

    function onToggleLock() {
        startTransition(async () => {
            const result = await setSubstatSetLock(characterName, !locked)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(!locked ? `已锁定「${characterName}」` : `已解锁「${characterName}」`, 'ok')
            router.refresh()
        })
    }

    return (
        <>
            <div className="wk-substat-shell">
                <aside className="wk-substat-side">
                    <div className="wk-substat-side-head">
                        <div className="wk-substat-char" title={characterName}>
                            {characterName}
                        </div>
                        {locked && <WkBadge tone="accent">仅管理员可改</WkBadge>}
                        <WkField label="备注" hint="展示在浏览页的角色条目上">
                            <WkInput
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                placeholder="例：仅计算本体"
                                maxLength={60}
                            />
                        </WkField>
                    </div>

                    <div className="wk-substat-slots" role="listbox" aria-label="声骸部位">
                        {plan.slots.map((slot, index) => {
                            const active = index === activeSlot
                            return (
                                <button
                                    key={index}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    className="wk-slot-item"
                                    data-active={active}
                                    onClick={() => setActiveSlot(index)}
                                >
                                    <span className="wk-slot-item-index">部位 {index + 1}</span>
                                    <span className="wk-slot-item-cost" data-cost={slot.cost}>
                                        {slot.cost}C
                                    </span>
                                    <span className="wk-slot-item-main">
                                        {mainStatShort(slot.mainStat?.type) || '未选主词条'}
                                    </span>
                                    <span className="wk-slot-item-sub">{slot.substats.length} 条副词条</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="wk-substat-side-foot">
                        {isAdmin && (
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
                                    width={15}
                                    height={15}
                                    aria-hidden="true"
                                />
                            </WkIconButton>
                        )}
                        {initialRow && (
                            <WkButton
                                size="sm"
                                variant="danger"
                                disabled={pending}
                                onClick={() => setConfirmDelete(true)}
                            >
                                删除方案
                            </WkButton>
                        )}
                    </div>
                </aside>

                <div className="wk-substat-main">
                    <div className="wk-substat-main-head">
                        <WkBadge tone={totalCost <= ECHO_MAX_TOTAL_COST ? 'default' : 'danger'}>
                            cost {totalCost}/{ECHO_MAX_TOTAL_COST}
                        </WkBadge>
                        <WkBadge tone={substatTotal === SUBSTAT_TOTAL_COUNT ? 'ok' : 'warn'}>
                            副词条 {substatTotal}/{SUBSTAT_TOTAL_COUNT}
                        </WkBadge>
                        {!planCheck.ok && (
                            <span className="wk-meta" style={{ color: 'var(--wk-danger)' }}>
                                {planCheck.error}
                            </span>
                        )}
                        <span className="wk-meta">
                            {initialRow
                                ? `更新于 ${timeAgo(initialRow.updated_at)}`
                                : '新方案（未保存）'}
                        </span>
                    </div>

                    <SubstatSlotEditor
                        index={activeSlot}
                        slot={plan.slots[activeSlot]}
                        onChange={(next) => updateSlot(activeSlot, next)}
                    />
                </div>
            </div>

            <div className="wk-substat-savebar">
                <WkBadge tone={dirty ? 'warn' : 'ok'}>{dirty ? '有未保存改动' : '已保存'}</WkBadge>
                <span className="wk-meta">{characterName}</span>
                <WkSpacer />
                <WkButton variant="primary" onClick={onSave} disabled={pending || !dirty || !canWrite}>
                    {pending ? '保存中…' : '保存'}
                </WkButton>
            </div>

            <WkConfirm
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title={`删除「${characterName}」的标准词条方案？`}
                description="删除后工具箱将不再同步到这个角色的方案，且不可撤销。"
                confirmLabel="永久删除"
                busy={pending}
                onConfirm={onDelete}
            />
        </>
    )
}
