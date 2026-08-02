# 椰果工坊 · WUWA-AFYG-SHARE

配合 [椰果工具箱](https://wuwa-afyg-tool.200503.xyz/) 使用的《鸣潮》工程分享平台。

用户可以上传椰果工具箱导出的工程 JSON，生成带有效期的分享链接；访客可浏览、克隆（下载）他人的拉表排轴工程。

## 功能

- **工程广场** — 浏览社区分享的工程，按最新/最热排序、按名称搜索
- **分享码** — 每个工程一个短链接，可设置有效期（7/30/90 天或永久），过期自动下架
- **详情预览** — 展示配队、武器、套装、声骸等元数据，无需登录即可下载原始 JSON
- **登录上传** — GitHub / 邮箱魔法链接登录后即可上传（浏览与克隆无需登录）
- **我的工程** — 编辑简介标签、延长/撤销分享码、换码、下架、删除、查看浏览量
- **点赞** — 登录用户可收藏他人工程

## 技术栈

| 层   | 技术                                   |
| ---- | -------------------------------------- |
| 框架 | [Next.js](https://nextjs.org) (App Router, React 19) |
| 样式 | [TailwindCSS](https://tailwindcss.com) v4 |
| 后端 | [Supabase](https://supabase.com)（Postgres + Auth + RLS） |
| 部署 | Vercel |

## 本地开发

### 1. 配置 Supabase

在 [Supabase](https://supabase.com/dashboard) 免费创建一个项目，然后在 **SQL Editor** 中执行：

```
supabase/migrations/0001_init.sql
```

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

## 与椰果工具箱的联动

- **上传**：在椰果工具箱中「导出」工程 JSON → 在本平台上「上传工程」
- **克隆**：在本平台「下载工程 JSON」→ 在椰果工具箱中「导入项目」

两边使用完全一致的工程文件格式，无需改造椰果工具箱本体。

## 免费档注意事项

- Supabase 免费项目闲置 **1 周** 会自动暂停，建议配置定时任务（如 GitHub Actions）定期发起一次请求保活。

