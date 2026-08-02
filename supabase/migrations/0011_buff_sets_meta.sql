-- 椰果工坊 · Buff 集元信息（scope / exclusive）
-- scope：该 buff 的受影响者；exclusive：是否专属于某效应
-- 取值：self（对自己）、self_except（对自己除外）、team（对全队）、effect_only（效应专属）

alter table public.buff_sets
    add column if not exists scope text not null default 'team',
    add column if not exists exclusive boolean not null default false;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'buff_sets_scope_check' and conrelid = 'public.buff_sets'::regclass
    ) then
        alter table public.buff_sets
            add constraint buff_sets_scope_check
            check (scope in ('self', 'self_except', 'team', 'effect_only'));
    end if;
end $$;
