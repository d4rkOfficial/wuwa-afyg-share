# Buff 集结构 v2（乘区贡献条目列表 + 条件分层）

> **状态：迁移已执行完毕。** 库内数据已是 v2；管理端的「Buff 集结构迁移」面板已下线。
> 本文保留作为结构与口径的说明文档。

## 为什么要迁到 v2

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

## 迁移当时做了什么

1. **乘区条目列表**：`zoneId` 旧 id 重映射 + 白名单校验；同乘区保留多条；覆盖按"同乘区唯一、后者优先"收敛；
   带引用的条目覆盖标记由引用接管；层数类乘区（集谐干涉 / 同奏增益）不保留引用。
2. **条件分层**：实例级旧 `chain` / `refinement` 升级为 `chains` / `refinements[{ charIdx: 0, min }]`；
   实例级 `elements` / `damageTypes` 下放到每个乘区条目（与工具箱 `normalizeZones` 同口径），实例级保留。
3. **无损**：只升级/规范化，不因此删除任何子句。`charIdx` 固定 0 —— 工坊没有配队上下文，
   工具箱导入时会以实际装配角色的槽位覆盖 `characterIdx`。
4. **快照**：只升级**根快照**的全量 `state`。版本快照的 `state` 恒为 NULL、`diff` 形状不动
   （遵守 check 约束 `buff_set_snapshot_shape`）。
5. **幂等**：已是 v2 的行原样返回。

## 数据库侧留下了什么

`supabase/migrations/0005_buff_set_v2.sql` 已应用，库内留下：

- `buff_set_migrations`：版本记账表（含本次迁移报告，作为审计留痕；前端已不再读取）；
- 一组幂等函数：`buff_condition_v2` / `buff_zone_list_v2` / `buff_set_upgrade_row_v2` /
  `buff_num_v2` / `migrate_buff_sets_v2` / `migrate_buff_set_snapshots_v2` /
  `restore_buff_set_snapshot_v2`。
  其中 **`restore_buff_set_snapshot_v2` 仍被应用调用**（`src/lib/actions/buff-snapshots.ts` 的还原路径），
  其余只在前端已下线的迁移面板里用过。

> 前端已不再提供迁移入口。若将来确实需要补跑（例如批量导入了 v1 数据），可以直接在
> SQL Editor 里调 `select public.migrate_buff_sets_v2(false);`（函数内会先校验管理员身份）。

## 代码侧还在做什么

库内已是 v2，但**读取边界仍可能出现 v1 形状**，所以保留了一个纯函数做就地归一化：

| 位置 | 作用 |
| --- | --- |
| `src/lib/buff-snapshots/migrate-v2.ts` | `upgradeBuffSetRowV2()`：v1 行 → v2 行的纯函数（不写库） |
| `src/lib/consts/buff-zones.ts` | v2 契约的**唯一真源**：乘区白名单、覆盖/引用禁用、条件清洗；SQL 里的常量表与它手工对齐 |
| `src/lib/buff-snapshots/diff.ts` | 快照归一化适配同乘区多条（按 zoneId + 内容排序） |

会走到归一化的两处：

1. **版本快照**存的是 `diff`（按设计保持 v1 形状），`rebuildSnapshotState` 重建出来的行是 v1——
   不归一化会让快照对比把"结构升级本身"误报成大量内容差异；
2. **用旧快照还原**时，写回的行也会带 v1 形状，公开浏览页与 SQL 导出都需要归一化后再输出。

改动任何一处规则时，记得同步 `0005_buff_set_v2.sql` 与 `migrate-v2.ts`，两侧口径必须一致。

## 迁移时踩到的 PG 陷阱（勿再犯）

- `text[] || 'literal'` 会按**数组字面量**解析右侧 → `22P02 malformed array literal`；必须 `|| ARRAY['x']`
- `IF v -> 'k' IS NULL THEN` 在键缺失时整句求值为 NULL，plpgsql 的 `IF` 只认 TRUE → 分支静默跳过；
  判断存在性一律用 `jsonb_typeof(v -> 'k')` 显式比较
- 版本快照的 `state` 必须保持 NULL，否则违反 `buff_set_snapshot_shape`（`23514`）
- `(v ->> 'k')::numeric` 遇到脏数据抛 `22P02` 会中断整次迁移 → 用 `buff_num_v2` 宽进

## 回滚

迁移只做结构升级、不删数据。回滚靠：管理页「快照」面板选目标版本还原（还原路径会兜底归一化），
或重新导入迁移前导出的全量 SQL（`/buff-sets` 页底部「导出 Buff 集全量 SQL」）。
