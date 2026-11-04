# Buff 文件夹结构迁移 Runbook

## 产物

所有迁移产物都在 `.tmp/backups/`（已 gitignore）：

| 文件 | 用途 |
| --- | --- |
| `buff-backup-*.json` / `buff-backup-*.sql` | 迁移前 `buff_sets` + `buff_set_snapshot` 全量备份 |
| `buff-mapping-preview-*.json` / `.csv` | 每条旧 Buff → 新文件夹 / 新全名映射，先审阅 |
| `migrate-buff-folders-*.sql` | 正式迁移：结构 + 数据 + 新基线快照 + 断言 |
| `migrate-buff-folders-dryrun-*.sql` | 事务预演，末尾 `ROLLBACK` |
| `rollback-buff-folders-*.sql` | 回滚 Buff 名 / 删除文件夹（旧快照从备份手工恢复） |

## 迁移规则

- 全名：`文件夹A\文件夹B\buff短名`；根 Buff 没有分隔符。
- 工坊只有一级文件夹；工具箱工程内最多两级。
- 归并键 = 前缀 + 后缀，同键 ≥2 条才建文件夹；`锁3链…` 与 `锁3链 同奏…` 不合并。
- 文件夹名用前缀；同前缀不同后缀撞名时补 `（后缀）`，仍撞名补 `#`。
- 子 Buff 短名 = `${数字}${后缀}`；全名 = `文件夹\短名`。
- 根 Buff 保持短名，文件夹排在根 Buff 前面。
- 线上旧快照按计划删除，迁移后写入一条新的 v2 基线快照。

## 执行顺序

1. 审阅 `buff-mapping-preview-*.csv`。
2. 在 Supabase SQL Editor 执行 `migrate-buff-folders-dryrun-*.sql`，确认断言通过且末尾回滚。
3. 执行 `migrate-buff-folders-*.sql`。
4. 校验：
   - `buff_sets` 有 `id` / `sort_order`；
   - `buff_folders` 存在，且文件夹数符合预览；
   - `/api/buff-sets` 返回 `folders`；
   - 新 `buff_set_snapshot` 根快照的 `state` 是 `{ buffs, folders }` 对象。
5. 若失败需要回滚：执行 `rollback-buff-folders-*.sql`；旧快照需从备份 SQL 手工恢复。

## 重新生成

```bash
cd wuwa-afyg-share
node scripts/buff-migration/buff-migration.mjs all
```

`backup` 通过 service role 只读拉取线上数据，不会写库。
