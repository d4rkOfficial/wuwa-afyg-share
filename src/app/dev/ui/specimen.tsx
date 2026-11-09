'use client'

// 设计系统 v2 样本页（/dev/ui）
// 只用于开发期验收：每加一个 primitive 就在这里放一组样例，业务页只做组合。
// 规范正文在 tmp/docs/ui-spec-v2.md（内部文档，不入库）；这个页面本身就是唯一的视觉样张
import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
    WkBadge,
    WkButton,
    WkCard,
    WkConfirm,
    WkContainer,
    WkDialog,
    WkDivider,
    WkEmpty,
    WkField,
    WkIconButton,
    WkInput,
    WkMenu,
    WkNum,
    WkPageHead,
    WkRoot,
    WkRow,
    WkRows,
    WkSectionHead,
    WkSegmented,
    WkSelect,
    WkSpacer,
    WkSwitch,
    WkTextarea,
    WkToolbar,
    wkToast
} from '@/design'

/** 样张里的头像占位（真实组件用上传的角色头像） */
function avatar(size: number): CSSProperties {
    return {
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(160deg, var(--wk-s2), var(--wk-s1))',
        border: '1px solid var(--wk-ctrl-line)',
        display: 'grid',
        placeItems: 'center',
        fontSize: 'var(--wk-t-meta)',
        color: 'var(--wk-fg-2)'
    }
}

export default function Specimen({ sampleAuthor = '长离手法大神' }: { sampleAuthor?: string }) {
    const [tab, setTab] = useState<'latest' | 'hot'>('latest')
    const [on, setOn] = useState(true)
    const [dialog, setDialog] = useState(false)
    const [confirm, setConfirm] = useState(false)
    const [menu, setMenu] = useState(false)
    const [entity, setEntity] = useState('布兰特')

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title="组件样本"
                    badge={<WkBadge tone="accent">v2</WkBadge>}
                    sub="六条硬规则的可执行版本：6 档字号 / 2 档控件高度 / 2 档圆角 / 共用列模板 / 单分区线 / 每屏一个主操作。全站唯一字族 FangXinShu。"
                    actions={
                        <>
                            <WkButton>次操作</WkButton>
                            <WkButton variant="primary">主操作</WkButton>
                        </>
                    }
                />

                <div style={{ marginTop: 24, display: 'grid', gap: 24 }}>
                    {/* ── 按钮 ── */}
                    <section>
                        <WkSectionHead title="按钮" aside="36 / 32 两档，同一行不混用" />
                        <WkCard pad>
                            <WkToolbar>
                                <WkButton>默认描边</WkButton>
                                <WkButton variant="primary">实心主操作</WkButton>
                                <WkButton variant="quiet">纯文字</WkButton>
                                <WkButton variant="danger">破坏性</WkButton>
                                <WkSpacer />
                                <WkButton size="sm">小号</WkButton>
                                <WkButton size="sm" variant="primary">
                                    小号主操作
                                </WkButton>
                                <WkIconButton label="更多操作">更多</WkIconButton>
                                <WkButton disabled>禁用</WkButton>
                            </WkToolbar>
                        </WkCard>
                    </section>

                    {/* ── 表单 ── */}
                    <section>
                        <WkSectionHead title="表单" aside="控件与按钮同高；标签 12px 在上；多行框不可拖拽高度" />
                        <WkCard pad>
                            <div
                                style={{
                                    display: 'grid',
                                    gap: 16,
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))'
                                }}
                            >
                                <WkField label="单行输入" hint="聚焦换金色描边，并出现 2px 焦点环">
                                    <WkInput placeholder="布兰特" />
                                </WkField>
                                <WkField label="下拉">
                                    <WkSelect defaultValue="a">
                                        <option value="a">角色</option>
                                        <option value="b">武器</option>
                                        <option value="c">套装</option>
                                    </WkSelect>
                                </WkField>
                                <WkField label="多行" hint="高度随内容自动增长，超出后在框内滚动">
                                    <WkTextarea rows={3} placeholder="施放共鸣技能时，布兰特基于共鸣效率获得额外攻击…" />
                                </WkField>
                                <div style={{ display: 'grid', gap: 12 }}>
                                    <WkField label="开关">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <WkSwitch checked={on} onChange={setOn} label="示例开关" />
                                            <span className="wk-meta">{on ? '已开启' : '已关闭'}</span>
                                        </div>
                                    </WkField>
                                    <WkField label="分段">
                                        <WkSegmented
                                            value={tab}
                                            onChange={setTab}
                                            ariaLabel="排序方式"
                                            options={[
                                                { value: 'latest', label: '最新' },
                                                { value: 'hot', label: '最热' }
                                            ]}
                                        />
                                    </WkField>
                                </div>
                            </div>
                        </WkCard>
                    </section>

                    {/* ── 徽标 ── */}
                    <section>
                        <WkSectionHead title="徽标" aside="固定 20 高、12px —— 不靠缩小按钮表达次要" />
                        <WkCard pad>
                            <WkToolbar>
                                <WkBadge>默认</WkBadge>
                                <WkBadge tone="accent">v2.4</WkBadge>
                                <WkBadge tone="ok">有效</WkBadge>
                                <WkBadge tone="warn">宽限中</WkBadge>
                                <WkBadge tone="danger">已过期</WkBadge>
                            </WkToolbar>
                        </WkCard>
                    </section>

                    {/* ── 行网格 ── */}
                    <section>
                        <WkSectionHead title="行网格" aside="表头与每一行共用同一套列模板" />
                        <WkCard>
                            <WkRows cols="minmax(0, 1fr) 72px 88px 96px">
                                <WkRow head>
                                    <span>实体</span>
                                    <WkNum>条数</WkNum>
                                    <span>状态</span>
                                    <span>操作</span>
                                </WkRow>
                                {[
                                    ['布兰特', '15', 'ok', '已保存'],
                                    ['散华', '6', 'warn', '未保存'],
                                    ['釉瑚（名字很长也不会错位）', '32', 'default', '锁定']
                                ].map(([name, count, tone, state]) => (
                                    <WkRow key={name}>
                                        <span
                                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        >
                                            {name}
                                        </span>
                                        <WkNum>{count}</WkNum>
                                        <span>
                                            <WkBadge tone={tone as 'ok' | 'warn' | 'default'}>{state}</WkBadge>
                                        </span>
                                        <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <WkButton size="sm" variant="quiet">
                                                编辑
                                            </WkButton>
                                        </span>
                                    </WkRow>
                                ))}
                            </WkRows>
                        </WkCard>
                    </section>

                    {/* ── 编辑台（单列）── */}
                    <section>
                        <WkSectionHead
                            title="编辑台（单列）"
                            aside="没有左侧对象列表：对象用顶部下拉切换，与编辑无关的进「更多」"
                        />
                        <div className="wk-editor">
                            <div className="wk-editor-head">
                                <div className="wk-editor-picker">
                                    <WkSelect
                                        value={entity}
                                        onChange={(event) => setEntity(event.target.value)}
                                        aria-label="选择实体"
                                    >
                                        <option value="布兰特">布兰特 · 角色 · 15 条</option>
                                        <option value="散华">散华 · 角色 · 6 条</option>
                                        <option value="釉瑚">釉瑚 · 角色 · 32 条</option>
                                    </WkSelect>
                                </div>
                                <WkButton size="sm">新建实体</WkButton>
                                <WkBadge tone="warn">未保存</WkBadge>
                                <WkSpacer />
                                <WkButton size="sm" variant="quiet">
                                    更多
                                </WkButton>
                            </div>

                            <WkCard pad>
                                <div className="wk-editor-body">
                                    <div className="wk-editor-group">
                                        <WkField label="实体名称">
                                            <WkInput defaultValue={entity} />
                                        </WkField>
                                        <WkField label="说明" hint="可选，随 Buff 集一起同步到工具箱">
                                            <WkTextarea rows={2} placeholder="例：仅计算本体，不含守岸人协奏" />
                                        </WkField>
                                    </div>

                                    <div className="wk-editor-group">
                                        <span className="wk-label">乘区</span>
                                        <WkRows cols="minmax(0, 1fr) 96px 112px 72px">
                                            <WkRow head>
                                                <span>名称</span>
                                                <WkNum>覆盖方式</WkNum>
                                                <span>条件</span>
                                                <span>操作</span>
                                            </WkRow>
                                            <WkRow>
                                                <span>基础攻击</span>
                                                <WkNum>覆盖</WkNum>
                                                <span>
                                                    <WkBadge>始终</WkBadge>
                                                </span>
                                                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <WkButton size="sm" variant="quiet">
                                                        编辑
                                                    </WkButton>
                                                </span>
                                            </WkRow>
                                            <WkRow>
                                                <span>攻击力加成</span>
                                                <WkNum>追加</WkNum>
                                                <span>
                                                    <WkBadge tone="warn">共鸣效率 250 以上</WkBadge>
                                                </span>
                                                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <WkButton size="sm" variant="quiet">
                                                        编辑
                                                    </WkButton>
                                                </span>
                                            </WkRow>
                                        </WkRows>
                                    </div>
                                </div>
                            </WkCard>

                            <div className="wk-editor-savebar">
                                <span className="wk-meta">有未保存改动</span>
                                <WkButton size="sm" variant="quiet">
                                    丢弃
                                </WkButton>
                                <WkSpacer />
                                <WkButton size="sm" variant="primary">
                                    保存
                                </WkButton>
                            </div>
                        </div>
                    </section>

                    {/* ── 工程卡（头像叠底）── */}
                    <section>
                        <WkSectionHead
                            title="工程卡"
                            aside="保留角色头像叠底；元信息行铺实色底，读数不被叠底干扰"
                        />
                        <div
                            style={{
                                display: 'grid',
                                gap: 12,
                                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
                            }}
                        >
                            <WkCard pad>
                                <div className="wk-card-art" style={{ opacity: 0.3 }} aria-hidden="true">
                                    <span style={avatar(72)}>汐</span>
                                    <span style={avatar(52)}>散</span>
                                </div>
                                <div className="wk-card-inner">
                                    <h3 style={{ fontSize: 'var(--wk-t-lead)' }}>今汐 · 衍射队 23 秒循环</h3>
                                    <p className="wk-meta" style={{ lineHeight: 1.65 }}>
                                        默认轴，共鸣回路在第一次变奏后再开，参考视频见简介。
                                    </p>
                                    <WkToolbar>
                                        <span className="wk-meta">#衍射</span>
                                        <span className="wk-meta">#23秒</span>
                                    </WkToolbar>
                                    <div className="wk-card-foot">
                                        <span>{sampleAuthor}</span>
                                        <span>·</span>
                                        <span>5 个月前</span>
                                        <WkSpacer />
                                        <span>浏览 1,284</span>
                                        <span>克隆 342</span>
                                    </div>
                                </div>
                            </WkCard>
                        </div>
                    </section>

                    {/* ── 浮层 ── */}
                    <section>
                        <WkSectionHead title="浮层" aside="全站一套弹层：焦点陷阱 + Esc + 关闭归还焦点" />
                        <WkCard pad>
                            <WkToolbar>
                                <WkButton size="sm" onClick={() => setDialog(true)}>
                                    打开弹窗
                                </WkButton>
                                <WkButton size="sm" variant="danger" onClick={() => setConfirm(true)}>
                                    破坏性确认
                                </WkButton>
                                <div style={{ position: 'relative' }}>
                                    <WkButton size="sm" variant="quiet" onClick={() => setMenu((value) => !value)}>
                                        更多
                                    </WkButton>
                                    {menu && (
                                        <WkMenu
                                            onClose={() => setMenu(false)}
                                            items={[
                                                { key: 'a', label: '重命名实体', onSelect: () => {} },
                                                { key: 'b', label: '复制为新实体', onSelect: () => {} },
                                                { key: 'c', label: '删除该实体', danger: true, onSelect: () => setConfirm(true) }
                                            ]}
                                        />
                                    )}
                                </div>
                                <WkButton size="sm" onClick={() => wkToast('已复制分享链接', 'ok')}>
                                    成功 toast
                                </WkButton>
                                <WkButton size="sm" onClick={() => wkToast('复制失败，请手动选择文本', 'error')}>
                                    错误 toast
                                </WkButton>
                            </WkToolbar>
                        </WkCard>
                    </section>

                    {/* ── 空态与排版 ── */}
                    <section>
                        <WkSectionHead title="空态与排版" />
                        <div
                            style={{
                                display: 'grid',
                                gap: 16,
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
                            }}
                        >
                            <WkCard>
                                <WkEmpty
                                    title="还没有条目"
                                    hint="点上方「新建实体」开始"
                                    action={<WkButton size="sm">新建实体</WkButton>}
                                />
                            </WkCard>
                            <WkCard pad>
                                <div className="wk-label">12px 元信息</div>
                                <p style={{ fontSize: 'var(--wk-t-body)' }}>
                                    14px 正文：数字列靠定宽 + 右对齐，不依赖字体等宽。
                                </p>
                                <p style={{ fontSize: 'var(--wk-t-lead)', marginTop: 6 }}>16px 卡片标题</p>
                                <p style={{ fontSize: 'var(--wk-t-sec)', marginTop: 6 }}>20px 区块标题</p>
                                <WkDivider />
                                <p className="wk-meta" style={{ marginTop: 8 }}>
                                    12 / 14 / 16 / 20 / 26 / 34 —— 只有这六档。
                                </p>
                            </WkCard>
                        </div>
                    </section>
                </div>
            </WkContainer>

            <WkDialog
                open={dialog}
                onClose={() => setDialog(false)}
                title="示例弹窗"
                footer={
                    <>
                        <WkButton variant="quiet" onClick={() => setDialog(false)}>
                            取消
                        </WkButton>
                        <WkButton variant="primary" onClick={() => setDialog(false)}>
                            保存
                        </WkButton>
                    </>
                }
            >
                <WkField label="标题">
                    <WkInput defaultValue="示例" />
                </WkField>
                <p className="wk-meta">Esc 关闭；Tab 被锁在弹窗内；关闭后焦点回到触发按钮。</p>
            </WkDialog>

            <WkConfirm
                open={confirm}
                onClose={() => setConfirm(false)}
                title="删除这个实体？"
                description="该实体的全部 Buff 会一起删除，且不可撤销。"
                confirmLabel="永久删除"
                onConfirm={() => {
                    setConfirm(false)
                    wkToast('已删除', 'ok')
                }}
            />
        </WkRoot>
    )
}
