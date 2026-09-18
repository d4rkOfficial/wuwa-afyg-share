# 椰果工坊 · WUWA-AFYG-SHARE

配合 [椰果工具箱](https://github.com/d4rkOfficial/wuwa-afyg-tool) 使用的《鸣潮》工程分享平台。

**业务一句话**：玩家把工具箱导出的工程 JSON 上传到工坊，得到一条带有效期的分享链接；其他玩家在工坊里浏览、克隆这些排轴拉表工程，并一键导入自己的工具箱。工坊同时托管两套**共享数据**——Buff 集与标准词条集——供工具箱一键同步，让全站玩家的 Buff 库与声骸词条口径保持一致。

- 主站：[wuwa-afyg-share.200503.xyz](https://wuwa-afyg-share.200503.xyz)
- 相关项目：[椰果工具箱](https://github.com/d4rkOfficial/wuwa-afyg-tool) · [轻量版工坊（sqlite）](https://github.com/d4rkOfficial/wuwa-afyg-share-lite) · [白嫖版工坊（GitHub Issues）](https://github.com/CoconutToolBox/wuwa-afyg-share-github)

## 文档

| 文档 | 内容 |
| ---- | ---- |
| [docs/api.md](docs/api.md) | **工坊对外 API**：最小集（列出工程 / 下载工程，接入工具箱必须实现）、扩展集（Buff 集 / 标准词条集）、可选业务 API |
| [docs/deployment.md](docs/deployment.md) | 部署到 Cloudflare Workers、Supabase 初始化与增量迁移、环境变量、本地开发、首个管理员设置、免费档注意事项 |

## 业务功能

### 工程分享（核心）

- **工程广场** — 浏览社区分享的工程，按最新/最热排序、按标题与作者搜索；已失效（含宽限）工程自动隐藏
- **分享码与有效期** — 每个工程一个短链接，可设过期日期（按天或永久），到期自动失效；非匿名作者过期后额外宽限一周
- **分享链接** — 复制时可选工具箱实例（主站/副站/本地或自定义），生成「工具箱地址 `#import_project=下载直链`」一键打开并自动导入
- **详情预览** — 展示配队、武器、套装、声骸等元数据，无需登录即可下载原始 JSON
- **登录上传 / 我的工程** — GitHub 或邮箱魔法链接登录后上传；作者可编辑简介标签、改期过期、换源（替换工程文件）、换码、删除
- **工程保护** — 作者或管理员可保护工程，豁免批量删除、单条删除与过期清理

### 共享数据（供工具箱同步）

- **Buff 集** — 角色/武器/声骸/套装的固定增益库；管理员在弹窗 IDE 中编辑，AI 可协作生成/润色/追问；公开浏览页按「类型 → 实体」分级展示。工具箱「Buff 集 → 从工坊同步」按实体整份覆盖拉取（本地自定义不受影响）
- **标准词条集** — 特殊角色的整份声骸词条方案（5 个部位的主词条 + 副主词条 + 共 14 条副词条，即「标准 14 词条」）。cost 组合不限（5 部位合计 ≤ 12）；编辑时主词条只选类型、**数值固定为满级上限**，副主词条**按 cost 自动推导**，副词条数值从**档位下拉**中选择。管理员在 `/admin/substat-sets` 维护，也可用 JSON 整体导入导出。工具箱在配装页「词条方案 → 工坊同步」或首次进入的同步弹窗中拉取；一般角色的方案由工具箱按角色数据本地生成
- **Buff 集快照** — 管理员可创建/更新快照（单快照模型）、对比当前与快照差异、一键恢复；快照只存基准，差异现算不落库
- **Buff 集 SQL 导出** — 公开下载全量 SQL（优先导出最新快照状态）

### 站点与权限

- **登录** — GitHub / 邮箱魔法链接；浏览与克隆无需登录，上传与「我的工程」需登录
- **管理员管理** — 按用户名授权；权限链模型：仅授出者可撤销自己的授权，被撤销的管理员其授出的权限连坐收回
- **清空内容** — 用户可清空自己的全部工程；管理员可按用户名删除任意用户的全部工程（保护工程除外），均需二次确认
- **AI 协作** — 站点内置 AI 助手（Buff 集生成/润色、命名规范、术语速查），走站内流式代理，密钥保存在浏览器本地

## 与椰果工具箱的联动

| 方向 | 做法 |
| ---- | ---- |
| 上传工程 | 工具箱「导出」工程 JSON → 工坊「上传工程」 |
| 克隆工程 | 工坊「下载工程 JSON」→ 工具箱「导入项目」；或直接用分享直链自动导入 |
| 同步 Buff 集 | 工具箱「Buff 集 → 从工坊同步」拉取 `GET /api/buff-sets` |
| 同步标准词条集 | 工具箱「词条方案 → 工坊同步」拉取 `GET /api/substat-sets`（首次进入工具箱时与 Buff 集合并询问） |

两边使用完全一致的工程文件格式，无需改造工具箱本体。自建工坊接入工具箱所需的接口契约见 [docs/api.md](docs/api.md)——**最少只需实现「列出工程」与「下载工程」两个接口**。

## 技术栈

| 层   | 技术                                   |
| ---- | -------------------------------------- |
| 框架 | [Next.js](https://nextjs.org) 16 (App Router, React 19) |
| 样式 | [TailwindCSS](https://tailwindcss.com) v4 |
| 后端 | [Supabase](https://supabase.com)（Postgres + Auth + RLS） |
| 部署 | [Cloudflare Workers](https://workers.cloudflare.com)（[OpenNext](https://opennext.js.org/cloudflare)） |

部署、数据库迁移与环境变量见 [docs/deployment.md](docs/deployment.md)。

## 声明

本项目与 [椰果工具箱](https://github.com/d4rkOfficial/wuwa-afyg-tool) 同源协作，许可与原作者补充声明见工具箱仓库的 [LICENSE](https://github.com/d4rkOfficial/wuwa-afyg-tool/blob/main/LICENSE)。
