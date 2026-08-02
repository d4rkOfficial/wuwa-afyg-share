-- 椰果工坊 · 权限调整
-- 1) buff_sets：登录用户（authenticated）即可编辑（公开读策略不变）
-- 2) projects：管理员可管理任意工程（改名/改过期/删除）

-- ── 1. buff_sets 登录可写 ─────────────────────────────────
drop policy if exists buff_sets_admin_all on public.buff_sets;
drop policy if exists buff_sets_authenticated_all on public.buff_sets;
create policy buff_sets_authenticated_all on public.buff_sets
    for all to authenticated
    using (true)
    with check (true);

-- 表级授权（0010 已 grant insert/update/delete，此处幂等补充）
grant insert, update, delete on public.buff_sets to authenticated;

-- ── 2. projects 管理员策略（改标题/过期/删除任意工程）──────
drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());
