-- 椰果工坊 · Buff 集数据表（只读公开）
-- 该表为游戏内实体（角色/武器/首位声骸/套装件数）的固定 buff 数值，
-- 由数据维护方（SQL / DeepSeek 生成）写入，前端及工具侧只读。

create table if not exists public.buff_sets (
    entity_type text not null,
    entity_name text not null,
    buff_name   text not null,
    buff_set    jsonb not null,
    primary key (entity_type, entity_name, buff_name),
    check (entity_type in ('character', 'weapon', 'echo', '1set', '2set', '3set', '4set', '5set'))
);

alter table public.buff_sets enable row level security;

-- 公开只读
create policy buff_sets_public_read on public.buff_sets
    for select
    using (true);

-- 数据 API 访问权限：仅放行只读，禁止匿名/登录用户写入
grant select on public.buff_sets to anon, authenticated;