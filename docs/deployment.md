# 部署与运维

本页是椰果工坊的部署、环境配置与运维说明。项目介绍与功能见 [README](../README.md)，接口清单见 [api.md](api.md)。

## 部署到 Cloudflare Workers

基于 `@opennextjs/cloudflare`（支持 Next.js 16，Node runtime）。提交 `main` 后由 Cloudflare **Workers Builds**（连接 GitHub）自动构建部署。

```bash
pnpm install
pnpm preview      # 本地 wrangler 预览（workerd 运行时）
pnpm deploy       # 构建并直接部署
pnpm upload       # 构建并上传新版本
```

关键配置：

- `wrangler.jsonc` — Worker 名 `wuwa-afyg-share`，`nodejs_compat` + `global_fetch_strictly_public`，静态资源 assets 绑定
- `open-next.config.ts` — OpenNext 默认配置
- `NEXT_PRIVATE_MINIMAL_MODE=1`（`wrangler.jsonc` vars）— 规避 Next `getMiddlewareManifest()` 在 workerd 的动态 `require` 报错（OpenNext 已知问题 #1232）
- **不使用 Node proxy/middleware**：OpenNext 暂不支持 Node middleware（Next 16 `proxy.ts` / `middleware.ts` 均强制 Node runtime）。登录保护与首次设用户名校验已下沉到 `/me`、`/upload` 页面 server 组件；Supabase session 过期后需重新登录
- `public/_headers` — `/_next/static` 静态资源长缓存

环境变量（Cloudflare Dashboard → Worker → Settings → Variables）：

- **Build 变量**：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_SITE_URL=https://wuwa-afyg-share.200503.xyz`
- **Runtime 变量**：同上 + `SUPABASE_SERVICE_ROLE_KEY`

自定义域名：`wuwa-afyg-share.200503.xyz`（Worker → Domains & Routes；DNS 在阿里云，CNAME 指向 Worker 端点）。

## 数据库初始化与升级

在 [Supabase](https://supabase.com/dashboard) 创建项目后，在 **SQL Editor** 执行：

```
supabase/migrations/0001_init.sql
```

> `0001_init.sql` 为全量初始化（已合并原 0001~0012 及 Buff 集单快照 / 管理员权限链 / 工程保护等后续增量），**全新数据库一次执行即可**；已按旧迁移初始化过的库请勿重跑。

后续增量迁移（已部署库的升级补丁）：

| 迁移 | 用途 |
| ---- | ---- |
| `0002_upgrade_snapshot_chain.sql` | Buff 集快照链（根 + 版本链） |
| `0003_search_projects.sql` | 工程搜索索引 |
| `0003_squash_snapshot.sql` | 快照合并到根（squash） |
| `0004_standard_substat_sets.sql` | 标准词条集（`standard_substat_sets` 表 + RLS，接口见 [api.md](api.md)） |

> 全新库执行完 `0001_init.sql` 后，还需补执行尚未包含在其中的增量（当前为 `0004_standard_substat_sets.sql`）。

## Auth 配置

开启 Auth 提供商（Dashboard → Authentication → Providers）：

- GitHub（可选）
- Email（邮箱魔法链接，必须）

在 **URL Configuration** 中把 `Site URL` 设为你的站点地址，并把 `http://localhost:3000` 加入 `Redirect URLs`。

## 本地开发

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

`.env.local` 需要填写：

| 变量 | 说明 |
| ---- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → API |
| `NEXT_PUBLIC_SITE_URL` | 站点地址（本地默认 `http://localhost:3000`） |

## 设置首个管理员

执行后立即生效：

```sql
update public.profiles p set is_admin = true
from auth.users u
where u.id = p.id and u.email = 'you@example.com';

-- 若需其成为根管理员（不可被页面撤销），执行回填语句：
insert into public.admin_grants (grantee_id, granted_by)
select id, null from public.profiles
where is_admin and id not in (select grantee_id from public.admin_grants)
on conflict do nothing;
```

## 免费档注意事项

- Supabase 免费项目闲置 **1 周** 会自动暂停，建议配置定时任务（如 GitHub Actions）定期发起一次请求保活。
- Cloudflare Workers **免费档 Worker 体积上限 3 MiB（gzip）**，付费档 10 MiB；构建后 `wrangler deploy` 会显示 gzip 体积，超限需升级付费档或精简依赖。
- 匿名上传的工程默认短有效期（10 分钟），正式分享请登录后上传。
