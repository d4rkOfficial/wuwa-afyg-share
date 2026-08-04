# 椰果工坊 · WUWA-AFYG-SHARE

配合 [椰果工具箱](https://wuwa-afyg-tool.200503.xyz/) 使用的《鸣潮》工程分享平台。

用户可以上传椰果工具箱导出的工程 JSON，生成带有效期的分享链接；访客可浏览、克隆（下载）他人的拉表排轴工程。

## 功能

- **工程广场** — 浏览社区分享的工程，按最新/最热排序、按名称搜索；已失效（含宽限）工程自动隐藏
- **分享码** — 每个工程一个短链接，可设置**过期日期**（按天选择或永久），到期自动失效；非匿名作者过期后额外宽限一周
- **分享链接** — 复制时可选**工具箱实例**（主站/副站/本地或自定义），生成「工具箱地址#import_project=下载直链」一键打开
- **详情预览** — 展示配队、武器、套装、声骸等元数据，无需登录即可下载原始 JSON
- **登录上传** — GitHub / 邮箱魔法链接登录后即可上传（浏览与克隆无需登录）
- **我的工程** — 编辑简介标签、按日期设置/改期过期、换源（替换工程文件）、换码、删除（仅宽限中工程）；所有操作有 toast 反馈
- **Buff 集** — 角色/武器/声骸/套装的固定增益库，供椰果工具箱一键导入；公开浏览页按类型→实体分级展示
- **Buff 集管理** — 实体网格（分类/搜索/星级与 Cost 筛选/有条目无条目过滤）点开弹窗 IDE 编辑；AI 协作按需调用工具生成/润色/追问
- **工程管理（管理员）** — 管理员可改名、调整过期时间、删除任意用户的分享工程

## 技术栈

| 层   | 技术                                   |
| ---- | -------------------------------------- |
| 框架 | [Next.js](https://nextjs.org) 16 (App Router, React 19) |
| 样式 | [TailwindCSS](https://tailwindcss.com) v4 |
| 后端 | [Supabase](https://supabase.com)（Postgres + Auth + RLS） |
| 部署 | [Cloudflare Workers](https://workers.cloudflare.com)（[OpenNext](https://opennext.js.org/cloudflare)） |

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

## 本地开发

### 1. 配置 Supabase

在 [Supabase](https://supabase.com/dashboard) 免费创建一个项目，然后在 **SQL Editor** 中执行：

```
supabase/migrations/0001_init.sql
```

> 该文件为全量初始化（已合并原 0001~0012），全新数据库一次执行即可。

开启 Auth 提供商（Dashboard → Authentication → Providers）：

- GitHub（可选）
- Email（邮箱魔法链接，必须）

在 **URL Configuration** 中把 `Site URL` 设为你的站点地址，并把 `http://localhost:3000` 加入 `Redirect URLs`。

### 2. 环境变量

```bash
cp .env.example .env.local
```

填入：

| 变量                         | 说明                          |
| ---------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`   | Dashboard → Settings → API   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dashboard → Settings → API |
| `NEXT_PUBLIC_SITE_URL`       | 站点地址（默认 localhost:3000） |

### 3. 启动

```bash
pnpm install
pnpm dev
```

## 权限说明

- **Buff 集保存/删除**：仅管理员可用（`profiles.is_admin = true`）；登录用户可进入管理页测试 AI 生成，但不落库。
- **设置管理员**（执行后重新登录生效）：

  ```sql
  update public.profiles p set is_admin = true
  from auth.users u
  where u.id = p.id and u.email = 'you@example.com';
  ```

## 与椰果工具箱的联动

- **上传**：在椰果工具箱中「导出」工程 JSON → 在本平台上「上传工程」
- **克隆**：在本平台「下载工程 JSON」→ 在椰果工具箱中「导入项目」
- **Buff 集**：椰果工具箱「主页 → Buff 集 → 从工坊同步」拉取本平台 `/api/buff-sets` 数据

两边使用完全一致的工程文件格式，无需改造椰果工具箱本体。

## 免费档注意事项

- Supabase 免费项目闲置 **1 周** 会自动暂停，建议配置定时任务（如 GitHub Actions）定期发起一次请求保活。
- Cloudflare Workers **免费档 Worker 体积上限 3 MiB（gzip）**，付费档 10 MiB；构建后 `wrangler deploy` 会显示 gzip 体积，超限需升级付费档或精简依赖。
