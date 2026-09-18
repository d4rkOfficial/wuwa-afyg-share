-- 0004_standard_substat_sets.sql
-- 标准词条集：鸣潮每个角色一套标准 14 条副词条声骸配置。
-- 大部分角色的方案由工具箱（wuwa-afyg-tool）本地按角色数据自动生成，
-- 工坊只保存「特殊角色」的整份方案（5 个部位的主词条 + 副主词条 + 副词条全覆盖），
-- 工具箱再从公开 API 拉取用于「一键改标准词条」。
-- ─────────────────────────────────────────────────────────────
-- plan 契约（JSON 由 src/lib/utils/echo-plan.ts 强校验，此处仅做形状兜底）：
--   {
--     "slots": [
--       {
--         "cost": 4,
--         "mainStat": { "type": "暴击率", "value": 22, "unit": "%" } | null,
--         "secondMainStat": { "type": "攻击", "value": 150, "unit": "" } | null,
--         "substats": [ { "type": "暴击率", "value": 10.5, "unit": "%" }, ... ]
--       }
--       // 恰好 5 个部位；cost 多重集合 = {4,3,3,1,1}；副词条合计恰好 14 条
--     ]
--   }

create table if not exists public.standard_substat_sets (
    id             uuid primary key default gen_random_uuid(),
    character_name text not null unique,
    plan           jsonb not null,
    note           text,
    updated_at     timestamptz not null default now()
);

-- 结构兜底：plan 必须是 { slots: [5 项] }（细粒度词条校验在服务端 actions 内）
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'standard_substat_sets_plan_shape') then
        alter table public.standard_substat_sets add constraint standard_substat_sets_plan_shape check (
            jsonb_typeof (plan) = 'object'
            and jsonb_typeof (plan -> 'slots') = 'array'
            and jsonb_array_length (plan -> 'slots') = 5
        );
    end if;
end $$;

-- updated_at 自动刷新（复用 0001_init.sql 的公共触发器函数）
drop trigger if exists standard_substat_sets_set_updated_at on public.standard_substat_sets;
create trigger standard_substat_sets_set_updated_at
    before update on public.standard_substat_sets
    for each row
    execute function public.set_updated_at ();

alter table public.standard_substat_sets enable row level security;

-- 公开只读（与 buff_sets 一致）
create policy standard_substat_sets_public_read on public.standard_substat_sets
    for select
    using (true);

-- 仅管理员可编辑（与 buff_sets 一致：公开读策略不变；站点侧编辑同样仅管理员）
create policy standard_substat_sets_admin_all on public.standard_substat_sets
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.standard_substat_sets to anon, authenticated;
grant insert, update, delete on public.standard_substat_sets to authenticated;
grant select, insert, update, delete on public.standard_substat_sets to service_role;

-- ═══════════════════════════════════════════════════════════════
-- 验证：
--   select policyname, cmd, roles from pg_policies
--   where tablename = 'standard_substat_sets';              -- 期望 2 条策略
--   select count(*) from public.standard_substat_sets;      -- 期望 0
-- ═══════════════════════════════════════════════════════════════
