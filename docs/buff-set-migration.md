# Buff 集结构迁移（v1 → v2）

## 为什么要迁移

工坊（本站）的 Buff 集数据结构与工具箱（wuwa-afyg-tool）必须说同一种"语言"。工具箱把 Buff 改成了
**"一切皆 buff 的乘区贡献条目列表"**，而工坊早期落库的形状是老的：

| | v1（旧） | v2（现行） |
| --- | --- | --- |
| `buff_set[]` | 每条 `{ zoneId, value, ref?, override? }`，**一个乘区只能出现一次** | **乘区贡献条目列表**：同一 `zoneId` 可重复，每条各带 `value / ref / override / condition` |
| `condition`（实例级） | 单值 `{ chain?: n, refinement?: n }` | `{ chains?: [{charIdx,min}], refinements?: [{charIdx,min}] }`，**链阶互斥**（只判定链） |
| 属性 / 类型条件 | 混挂在实例级 `{ elements?, damageTypes? }` | 挂在**具体乘区条目**上（实例级保留仅为兼容读取） |
| 乘区级条件 | 无 | `{ elements?, damageTypes? }` |
| 特殊终伤乘区 id | `customFinalDmg` / `customFinalDmgMul` | `specialFinal1` / `specialFinal2`（旧 id 在读取侧仍能识别） |
| 覆盖 | 任意条数 | **同乘区唯一**；百分比类 / 额外倍率不支持覆盖 |

老数据不会被工具箱丢掉（工具箱读取时会做等价解释与 id 别名兜底），但工坊自己是按 v1 编辑/展示/diff 的，
所以需要在库内升级一次，让**管理端编辑、公开浏览、AI 生成、快照 diff、SQL 导出**全部按 v2 工作。

## 迁移做了什么

1. **乘区条目列表**：`zoneId` 做旧 id 重映射 + 白名单校验；同乘区保留多条；覆盖按"同乘区唯一、后者优先"收敛；
   带引用的条目覆盖标记由引用接管；层数类乘区（集谐干涉 / 同奏增益）不保留引用。
2. **条件分层**：实例级旧 `chain` / `refinement` 升级为 `chains` / `refinements[{ charIdx: 0, min }]`（链阶互斥）；
   实例级 `elements` / `damageTypes` **下放到每个乘区条目**（与工具箱 `normalizeZones` 同口径），同时在实例级保留。
3. **无损**：只升级/规范化，不因为迁移删除任何子句。`charIdx` 固定 0 —— 工坊没有配队上下文，
   工具箱导入时会以实际装配角色的槽位覆盖 `characterIdx`。
4. **幂等**：已是 v2 的行原样返回，可以重复执行（新增的行、还原旧快照后的残留都能补跑）。

## 怎么执行

### 1) 应用数据库迁移（必须）

```bash
supabase db push        # 或 supabase migration up
```

`0005_buff_set_v2.sql` 会：

- 建迁移记账表 `buff_set_migrations`；
- 安装一组幂等 SQL 函数（`buff_set_upgrade_row_v2` / `migrate_buff_sets_v2` / `migrate_buff_set_snapshots_v2` /
  `restore_buff_set_snapshot_v2`）；
- **在同一事务内自动回填一次**现有 `buff_sets`（迁移执行上下文里 `auth.uid()` 为空，所以这段是内联 SQL，
  不走带管理员判定的 RPC）；
- 写入 `version = 2` 的记账行与报告。

> 迁移是单事务的：中途失败会整体回滚，不会留下半迁移状态。

### 2) 预演与补跑（管理页）

打开 `/admin/buff-sets` → 顶部「**Buff 集结构迁移**」面板：

- **预演（不写库）**：在服务端按同一套规则对现有行 dry-run，列出会改动的行数与每类改动；
- **执行迁移**：调用数据库函数（幂等、可重复）；完成后面板会显示最新报告。

建议的常规流程：**先「更新快照」→ 预演 → 执行迁移 → 对比快照差异确认改动符合预期**。

### 3) 快照与还原

- 迁移会一并升级 `buff_set_snapshot.state`；
- 服务端还原改走 `restore_buff_set_snapshot_v2`：它先把要写入的状态升级到 v2，再交给原 `restore_buff_set_snapshot`，
  因此**用旧快照还原也不会把 v1 结构灌回线上**；
- 快照的对比/追加版本走的是"读取边界升级"（`fetched rows` / `snapshot state` 在内存里升级到 v2 后再 diff），
  避免把"结构升级本身"误报成大量内容差异。

## 代码侧的口径（两个实现必须一致）

| 位置 | 作用 |
| --- | --- |
| `supabase/migrations/0005_buff_set_v2.sql` | **正式迁移**（单事务、幂等），含常量表 / 条件升级 / 乘区升级 / 行升级 / 入口 / 快照 / 还原 |
| `src/lib/buff-snapshots/migrate-v2.ts` | 同一套规则的 TS 纯函数：管理页 dry-run、公开页/导出/快照的读取边界升级 |
| `src/lib/consts/buff-zones.ts` | v2 契约（乘区白名单、覆盖/引用禁用、条件清洗）——**唯一真源**，SQL 里的常量表与它手工对齐 |
| `src/lib/actions/buff-migrations.ts` | 管理页服务端动作（读状态 / 预演 / 执行） |
| `src/components/admin/buff-migration-panel.tsx` | 管理页面板 |

改动任何一侧的规则时，记得同步 SQL 与 TS：两侧的改动项文案（`BUFF_SET_CHANGE_LABELS`）也保持一一对应。

## 回滚

迁移只做结构升级，不做数据删除。若需要回退：

1. 从迁移前的快照还原（管理页「快照」面板选择目标版本 → 恢复）；
2. 或从「导出 Buff 集全量 SQL」在迁移前留存的导出文件重新导入。

`buff_set_migrations` 里的 `version = 2` 记账行可以 `delete`，这样自动回填会在下次应用迁移时重跑。
