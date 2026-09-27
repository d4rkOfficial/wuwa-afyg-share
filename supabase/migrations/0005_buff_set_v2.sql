-- 0005_buff_set_v2.sql
-- Buff 集 v2：乘区「贡献条目列表」+ 条件分层挂载。
-- ─────────────────────────────────────────────────────────────
-- 背景（迁移原因）
--   工具箱把 Buff 结构改成了「一切皆 buff 的乘区条目列表」，而工坊早期落库的形状是：
--     · buff_set[] 每条只有 { zoneId, value, ref?, override? }，**一个乘区只能出现一次**
--     · 生效条件只有实例级单值 { chain?: n, refinement?: n }，属性/类型条件混挂在实例级
--   工具箱读取时会这样解释这些旧行（wuwa-afyg-tool 的 migration.normalizeZones / condition.ts）：
--     · 实例级 elements / damageTypes → **下放到每一个乘区条目**
--     · 实例级 chain / refinement        → 升级为 chains / refinements[{ charIdx: 0, min }]
--     · 链与阶互斥：同时存在时只判定链条件（阶条件整体忽略）
--   为了让工坊（管理端编辑、公开浏览、AI 生成、快照 diff）与工具箱**说同一种结构**，
--   这里把现有数据一次性迁移到 v2，并提供幂等函数给后续编辑/还原复用。
--
-- v2 契约（与 src/lib/consts/buff-zones.ts、wuwa-afyg-tool 的 BuffInstance 一致）
--   buff_sets.buff_set  jsonb 数组，元素 = 乘区贡献条目：
--     { "zoneId": "...", "value": n, "override"?: true, "ref"?: {...}, "condition"?: { "elements"?: [], "damageTypes"?: [] } }
--     · 同一 zoneId 可重复出现（各自独立贡献），仅剔除「同乘区 + 同覆盖 + 同条件」的完全重复
--     · override=true 时同一乘区内只保留一个（后者优先）；带 ref 的条目覆盖标记由引用接管
--     · 百分比类 / 额外倍率（atkPct/hpPct/defPct/extraRatio）不支持覆盖
--     · 层数类乘区（tuneStrainLayer/unisonBoonLayer）不保留 ref
--   buff_sets.condition  jsonb 实例级硬门槛：
--     { "chains"?: [{ "charIdx": 0-2, "min": 0-6 }], "refinements"?: [{ "charIdx": 0-2, "min": 1-5 }] }
--     · 链 / 阶互斥（只保留链）；elements / damageTypes 保留但只是兼容读取（真正生效的是乘区级）
--
-- 迁移策略（无损 + 幂等 + 可 dry-run）
--   1. 不删除任何子句：旧 chain/refinement 升级为数组形式；属性/类型既**下放到乘区**又**保留在实例级**
--      （工具箱 normalizeZones 对两者都支持，保留可避免整行 0 个乘区时丢条件）。
--   2. 旧乘区 id（customFinalDmg / customFinalDmgMul）重映射为 specialFinal1 / specialFinal2；
--      读取侧本来就有别名兜底，这里只是把库内数据也改成规范 id。
--   3. 快照（buff_set_snapshot.state）同样迁移，保证「还原旧版本」不会把老结构灌回线上；
--      restore 时再兜底迁移一次（幂等）。
--   4. 迁移是单事务、可重复执行：upgrade_* 函数对已是 v2 的行返回原值。
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. 迁移记账表（记录版本、时间、报告，便于面板展示与排查）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.buff_set_migrations (
    version    integer primary key,
    name       text not null,
    applied_at timestamptz not null default now(),
    applied_by uuid,
    report     jsonb not null default '{}'::jsonb
);

alter table public.buff_set_migrations enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where tablename = 'buff_set_migrations' and policyname = 'buff_set_migrations_public_read') then
        create policy buff_set_migrations_public_read on public.buff_set_migrations
            for select using (true);
    end if;
    if not exists (select 1 from pg_policies where tablename = 'buff_set_migrations' and policyname = 'buff_set_migrations_admin_write') then
        create policy buff_set_migrations_admin_write on public.buff_set_migrations
            for all to authenticated
            using (public.is_admin ())
            with check (public.is_admin ());
    end if;
end $$;

grant select on public.buff_set_migrations to anon, authenticated;
grant insert, update, delete on public.buff_set_migrations to authenticated;
grant select, insert, update, delete on public.buff_set_migrations to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. 常量：乘区白名单 / 覆盖禁用 / 引用禁用 / 旧 id 别名
--    与 src/lib/consts/buff-zones.ts 手工保持一致（SQL 侧无法 import TS 常量）
-- ─────────────────────────────────────────────────────────────
create or replace function public.buff_zone_ids_v2 ()
    returns text[]
    language sql
    immutable
as $$
    select array[
        'atkFlat', 'hpFlat', 'defFlat', 'tuneBreakBoost',
        'atkPct', 'hpPct', 'defPct', 'recharge', 'offTuneBuildupRate',
        'critRate', 'critDmg',
        'bonusDmg', 'deepenDmg', 'dmgTakenInc', 'finalDmg',
        'specialFinal1', 'specialFinal2',
        'extraRatio',
        'defDown', 'resDown',
        'resPen', 'defPen', 'dmgRedPen',
        'tuneStrainLayer', 'unisonBoonLayer'
    ]::text[]
$$;

create or replace function public.buff_zone_alias_v2 (p_zone text)
    returns text
    language sql
    immutable
as $$
    select case p_zone
        when 'customFinalDmg' then 'specialFinal1'
        when 'customFinalDmgMul' then 'specialFinal2'
        else p_zone
    end
$$;

create or replace function public.buff_zone_no_override_v2 (p_zone text)
    returns boolean
    language sql
    immutable
as $$
    select p_zone in ('atkPct', 'hpPct', 'defPct', 'extraRatio')
$$;

create or replace function public.buff_zone_no_ref_v2 (p_zone text)
    returns boolean
    language sql
    immutable
as $$
    select p_zone in ('tuneStrainLayer', 'unisonBoonLayer')
$$;

create or replace function public.buff_ref_zone_ids_v2 ()
    returns text[]
    language sql
    immutable
as $$
    select array[
        'baseAtk', 'totalAtk', 'baseHp', 'totalHp', 'baseDef', 'totalDef',
        'recharge', 'tuneBreakBoost', 'offTuneBuildupRate', 'critRate', 'critDmg'
    ]::text[]
$$;

/**
 * @desc 宽进的安全数值转换：只接受**真正的 JSON number**，其它（字符串 "15"、null、嵌套结构）
 * 一律回退到 p_fallback。
 *
 * 为什么需要它：迁移要处理历史脏数据，`(v_raw ->> 'value')::numeric` 在遇到 `"15"` 或 `"abc"`
 * 时会直接抛 22P02 中断整次迁移；而 jsonb 数组里的数字本身也可能是 `null`。迁移的目标是
 * "尽量升级、绝不中断"，所以数值口径统一走这里。
 */
create or replace function public.buff_num_v2 (p_value jsonb, p_fallback numeric default 0)
    returns numeric
    language sql
    immutable
as $$
    select case
        when p_value is null or jsonb_typeof (p_value) <> 'number' then p_fallback
        else (p_value #>> '{}')::numeric
    end
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. 条件升级（纯函数，幂等）
--    · chain/refinement 单值 → chains/refinements 数组（charIdx 固定 0；工坊无配队上下文）
--    · 链阶互斥：同时存在只保留 chains
--    · elements/damageTypes 白名单过滤 + 去重后原样保留（下放到乘区由 buff_zone_list_v2 负责）
-- ─────────────────────────────────────────────────────────────
create or replace function public.buff_condition_v2 (p_cond jsonb)
    returns jsonb
    language plpgsql
    immutable
as $$
declare
    v_out jsonb := '{}'::jsonb;
    v_agg jsonb;
    v_min int;
begin
    if p_cond is null or jsonb_typeof (p_cond) <> 'object' then
        return '{}'::jsonb;
    end if;

    -- 数组形式：只保留结构合法的子句
    if jsonb_typeof (p_cond -> 'chains') = 'array' then
        select jsonb_agg (jsonb_build_object ('charIdx', (c ->> 'charIdx')::int, 'min', (c ->> 'min')::int))
        into v_agg
        from jsonb_array_elements (p_cond -> 'chains') c
        where jsonb_typeof (c -> 'min') = 'number'
          and jsonb_typeof (c -> 'charIdx') = 'number'
          and (c ->> 'charIdx')::int between 0 and 2
          and (c ->> 'min')::int between 0 and 6;
        if v_agg is not null then
            v_out := jsonb_set (v_out, '{chains}', v_agg);
        end if;
    end if;

    if jsonb_typeof (p_cond -> 'refinements') = 'array' then
        select jsonb_agg (jsonb_build_object ('charIdx', (c ->> 'charIdx')::int, 'min', (c ->> 'min')::int))
        into v_agg
        from jsonb_array_elements (p_cond -> 'refinements') c
        where jsonb_typeof (c -> 'min') = 'number'
          and jsonb_typeof (c -> 'charIdx') = 'number'
          and (c ->> 'charIdx')::int between 0 and 2
          and (c ->> 'min')::int between 1 and 5;
        if v_agg is not null then
            v_out := jsonb_set (v_out, '{refinements}', v_agg);
        end if;
    end if;

    -- 旧单值字段：升级为数组（chain 0-6 / refinement 1-5）
    -- 注意：`v_out -> 'chains' is null` 在键缺失时求值为 NULL，plpgsql 的 IF 只认 TRUE，
    -- 会让整个分支静默跳过，所以一律用 jsonb_typeof(...) = 'array' 显式判定存在性。
    if jsonb_typeof (v_out -> 'chains') <> 'array' and jsonb_typeof (p_cond -> 'chain') = 'number' then
        v_min := (p_cond ->> 'chain')::int;
        if v_min between 0 and 6 then
            v_out := jsonb_set (v_out, '{chains}', jsonb_build_array (jsonb_build_object ('charIdx', 0, 'min', v_min)));
        end if;
    end if;

    if jsonb_typeof (v_out -> 'refinements') <> 'array' and jsonb_typeof (p_cond -> 'refinement') = 'number' then
        v_min := (p_cond ->> 'refinement')::int;
        if v_min between 1 and 5 then
            v_out := jsonb_set (v_out, '{refinements}', jsonb_build_array (jsonb_build_object ('charIdx', 0, 'min', v_min)));
        end if;
    end if;

    -- 链 / 阶互斥：只保留链
    if jsonb_typeof (v_out -> 'chains') = 'array' then
        v_out := v_out - 'refinements';
    end if;

    -- 属性 / 类型：白名单过滤 + 去重
    if jsonb_typeof (p_cond -> 'elements') = 'array' then
        select jsonb_agg (distinct e) into v_agg
        from jsonb_array_elements_text (p_cond -> 'elements') e
        where e in ('物理', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭');
        if v_agg is not null then
            v_out := jsonb_set (v_out, '{elements}', v_agg);
        end if;
    end if;

    if jsonb_typeof (p_cond -> 'damageTypes') = 'array' then
        select jsonb_agg (distinct d) into v_agg
        from jsonb_array_elements_text (p_cond -> 'damageTypes') d
        where d in (
            '普攻伤害', '重击伤害', '共鸣技能伤害', '共鸣解放伤害', '声骸技能伤害',
            '变奏技能伤害', '延奏技能伤害', '协同攻击伤害', '效应伤害', '其它类型伤害'
        );
        if v_agg is not null then
            v_out := jsonb_set (v_out, '{damageTypes}', v_agg);
        end if;
    end if;

    return v_out;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. 乘区条目列表升级（纯函数，幂等）
--    入参 p_cond 为该行**实例级**条件（升级前），其中的属性/类型会下放到每个乘区条目
--    （与工具箱 normalizeZones 同口径）；链/阶不下放，它们只能挂在整行上。
--    返回 { "zones": [...], "flags": {...} }，flags 供迁移报告统计。
-- ─────────────────────────────────────────────────────────────
create or replace function public.buff_zone_list_v2 (p_zones jsonb, p_cond jsonb)
    returns jsonb
    language plpgsql
    immutable
as $$
declare
    v_src jsonb[] := array[]::jsonb[];
    v_out jsonb := '[]'::jsonb;
    v_extra_elements jsonb := '[]'::jsonb;
    v_extra_types jsonb := '[]'::jsonb;
    v_raw jsonb;
    v_entry jsonb;
    v_ref jsonb;
    v_cond jsonb;
    v_zone text;
    v_zone_canon text;
    v_override boolean;
    v_has_ref boolean;
    v_override_seen text[] := array[]::text[];
    v_ids text[] := public.buff_zone_ids_v2 ();
    v_pushed int := 0;
    v_remapped int := 0;
    v_override_dropped int := 0;
    v_ref_dropped int := 0;
    v_unknown int := 0;
    v_invalid_ref int := 0;
begin
    if p_zones is null or jsonb_typeof (p_zones) <> 'array' then
        return jsonb_build_object ('zones', '[]'::jsonb, 'flags', jsonb_build_object ('unknown_zones', 0));
    end if;

    -- 实例级属性/类型条件 → 下放到每个乘区条目
    if jsonb_typeof (p_cond -> 'elements') = 'array' then
        v_extra_elements := p_cond -> 'elements';
    end if;
    if jsonb_typeof (p_cond -> 'damageTypes') = 'array' then
        v_extra_types := p_cond -> 'damageTypes';
    end if;

    -- 倒序遍历（空数组时循环体不执行）：覆盖「同乘区只保留一个」时后出现者优先，先出现者被丢弃
    for v_raw in
        select value
        from jsonb_array_elements (p_zones) with ordinality as t (value, ord)
        order by ord desc
    loop
        if jsonb_typeof (v_raw) <> 'object' then
            v_unknown := v_unknown + 1;
            continue;
        end if;

        v_zone := v_raw ->> 'zoneId';
        if v_zone is null or v_zone = '' then
            v_unknown := v_unknown + 1;
            continue;
        end if;
        v_zone_canon := public.buff_zone_alias_v2 (v_zone);
        if not (v_zone_canon = any (v_ids)) then
            v_unknown := v_unknown + 1;
            continue;
        end if;
        if v_zone_canon <> v_zone then
            v_remapped := v_remapped + 1;
        end if;

        -- 引用：结构合法（目标在引用白名单内、pct 为数字）且该乘区允许引用
        v_has_ref := false;
        if jsonb_typeof (v_raw -> 'ref') = 'object' then
            if (v_raw -> 'ref' ->> 'targetZoneId') = any (public.buff_ref_zone_ids_v2 ())
               and jsonb_typeof (v_raw -> 'ref' -> 'pct') = 'number'
               and not public.buff_zone_no_ref_v2 (v_zone_canon) then
                v_has_ref := true;
            else
                v_invalid_ref := v_invalid_ref + 1;
                if public.buff_zone_no_ref_v2 (v_zone_canon) then
                    v_ref_dropped := v_ref_dropped + 1;
                end if;
            end if;
        end if;

        -- 覆盖：带引用 / 禁用覆盖的乘区 → 追加；同乘区只保留一个
        v_override := coalesce ((v_raw ->> 'override')::boolean, false);
        if v_override and (v_has_ref or public.buff_zone_no_override_v2 (v_zone_canon)) then
            v_override := false;
            v_override_dropped := v_override_dropped + 1;
        end if;
        if v_override then
            if v_zone_canon = any (v_override_seen) then
                v_override := false;
                v_override_dropped := v_override_dropped + 1;
            else
                v_override_seen := v_override_seen || ARRAY[v_zone_canon];
            end if;
        end if;

        -- 乘区级条件 = 条目自身条件 ∪ 实例级下放（键合并：条目自身值优先，缺失的键取实例级）
        v_cond := public.buff_condition_v2 (v_raw -> 'condition');
        if jsonb_array_length (v_extra_elements) > 0 or jsonb_array_length (v_extra_types) > 0 then
            v_pushed := v_pushed + 1;
            v_cond := public.buff_condition_v2 (v_cond || public.buff_condition_v2 (
                jsonb_build_object (
                    'elements', v_extra_elements,
                    'damageTypes', v_extra_types
                )
            ));
        end if;

        -- 组装（固定键序：zoneId → value → override → ref → condition）；数值一律走 buff_num_v2 兜底
        v_entry := jsonb_build_object ('zoneId', v_zone_canon, 'value', public.buff_num_v2 (v_raw -> 'value', 0));
        if v_override then
            v_entry := v_entry || jsonb_build_object ('override', true);
        end if;
        if v_has_ref then
            v_ref := jsonb_build_object (
                'targetZoneId', v_raw -> 'ref' ->> 'targetZoneId',
                'pct', public.buff_num_v2 (v_raw -> 'ref' -> 'pct', 0)
            );
            if jsonb_typeof (v_raw -> 'ref' -> 'threshold') = 'number' then
                v_ref := v_ref || jsonb_build_object ('threshold', public.buff_num_v2 (v_raw -> 'ref' -> 'threshold'));
            end if;
            if jsonb_typeof (v_raw -> 'ref' -> 'lower') = 'number' then
                v_ref := v_ref || jsonb_build_object ('lower', public.buff_num_v2 (v_raw -> 'ref' -> 'lower'));
            end if;
            if jsonb_typeof (v_raw -> 'ref' -> 'upper') = 'number' then
                v_ref := v_ref || jsonb_build_object ('upper', public.buff_num_v2 (v_raw -> 'ref' -> 'upper'));
            end if;
            if jsonb_typeof (v_raw -> 'ref' -> 'discrete') = 'boolean' and (v_raw -> 'ref' ->> 'discrete')::boolean then
                v_ref := v_ref || jsonb_build_object ('discrete', true);
            end if;
            if jsonb_typeof (v_raw -> 'ref' -> 'divisor') = 'number' then
                v_ref := v_ref || jsonb_build_object ('divisor', public.buff_num_v2 (v_raw -> 'ref' -> 'divisor'));
            end if;
            if jsonb_typeof (v_raw -> 'ref' -> 'multiplier') = 'number' then
                v_ref := v_ref || jsonb_build_object ('multiplier', public.buff_num_v2 (v_raw -> 'ref' -> 'multiplier'));
            end if;
            if (v_raw -> 'ref' ->> 'refOwner') in ('self', 'owner') then
                v_ref := v_ref || jsonb_build_object ('refOwner', v_raw -> 'ref' ->> 'refOwner');
            end if;
            v_entry := v_entry || jsonb_build_object ('ref', v_ref);
        end if;
        if v_cond <> '{}'::jsonb then
            v_entry := v_entry || jsonb_build_object ('condition', v_cond);
        end if;

        v_out := jsonb_build_array (v_entry) || v_out;
    end loop;

    return jsonb_build_object (
        'zones', v_out,
        'flags', jsonb_build_object (
            'unknown_zones', v_unknown,
            'remapped_zone_ids', v_remapped,
            'pushed_zone_conditions', v_pushed,
            'dropped_overrides', v_override_dropped,
            'dropped_refs', v_ref_dropped,
            'invalid_refs', v_invalid_ref
        )
    );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. 单行升级（纯函数，幂等）
--    入参 = 一行 { entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set }
--    返回 = { v(版本) | already, row(升级后), changes(改动过的结构路径，最多 3 项) }
-- ─────────────────────────────────────────────────────────────
create or replace function public.buff_set_upgrade_row_v2 (p_row jsonb)
    returns jsonb
    language plpgsql
    stable
as $$
declare
    v_zones jsonb;
    v_flags jsonb;
    v_cond jsonb;
    v_scope text;
    v_exclusive boolean;
    v_changes text[] := array[]::text[];
    v_after jsonb;
begin
    -- 乘区条目列表
    v_zones := public.buff_zone_list_v2 (p_row -> 'buff_set', p_row -> 'condition');
    v_flags := v_zones -> 'flags';

    -- 注意：text[] 与字符串常量用 || 拼接时，PG 会尝试把字符串解析成数组字面量
    -- （'buff_set' 没有花括号 → 22P02 malformed array literal），必须用 ARRAY[...] 构造元素。
    if coalesce (p_row -> 'buff_set', '[]'::jsonb) is distinct from v_zones -> 'zones' then
        v_changes := v_changes || ARRAY['buff_set'];
    end if;
    if coalesce ((v_flags ->> 'unknown_zones')::int, 0) > 0 then
        v_changes := v_changes || ARRAY['buff_set[].zoneId(未知乘区已剔除)'];
    end if;
    if coalesce ((v_flags ->> 'remapped_zone_ids')::int, 0) > 0 then
        v_changes := v_changes || ARRAY['buff_set[].zoneId(旧 id 重映射)'];
    end if;
    if coalesce ((v_flags ->> 'pushed_zone_conditions')::int, 0) > 0 then
        v_changes := v_changes || ARRAY['buff_set[].condition(实例级条件下放)'];
    end if;
    if coalesce ((v_flags ->> 'dropped_overrides')::int, 0) > 0 then
        v_changes := v_changes || ARRAY['buff_set[].override(覆盖唯一/该乘区不支持)'];
    end if;
    if coalesce ((v_flags ->> 'dropped_refs')::int, 0) > 0 then
        v_changes := v_changes || ARRAY['buff_set[].ref(层数类乘区不支持引用)'];
    end if;
    if coalesce ((v_flags ->> 'invalid_refs')::int, 0) > 0 then
        v_changes := v_changes || ARRAY['buff_set[].ref(非法引用已剔除)'];
    end if;

    -- 实例级条件（链/阶升级为数组 + 链阶互斥 + 白名单）
    v_cond := public.buff_condition_v2 (p_row -> 'condition');
    if p_row ? 'condition' or v_cond <> '{}'::jsonb then
        v_changes := v_changes || ARRAY['condition'];
    end if;

    -- scope / exclusive 归一化（历史脏数据兜底）
    v_scope := coalesce (nullif (p_row ->> 'scope', ''), 'team');
    if not (v_scope in ('self', 'self_except', 'team', 'effect_only')) then
        v_scope := 'team';
        v_changes := v_changes || ARRAY['scope(非法值兜底 team)'];
    end if;
    v_exclusive := coalesce ((p_row ->> 'exclusive')::boolean, false);

    v_after := jsonb_build_object (
        'entity_type', p_row ->> 'entity_type',
        'entity_name', p_row ->> 'entity_name',
        'buff_name', p_row ->> 'buff_name',
        'scope', v_scope,
        'exclusive', v_exclusive,
        'condition', case when v_cond = '{}'::jsonb then null else v_cond end,
        'buff_set', v_zones -> 'zones'
    );

    -- exclusive 非 false 时标记改动（默认 false，无需改）
    if v_exclusive then
        v_changes := v_changes || ARRAY['exclusive'];
    end if;

    if array_length (v_changes, 1) is null then
        return jsonb_build_object ('already', true, 'row', v_after, 'changes', '[]'::jsonb);
    end if;

    return jsonb_build_object (
        'v', 2,
        'row', v_after,
        'changes', to_jsonb (v_changes[1:3])
    );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. 迁移入口：迁移全部现有 Buff 集（p_dry_run=true 只出报告不落库）
-- ─────────────────────────────────────────────────────────────
create or replace function public.migrate_buff_sets_v2 (p_dry_run boolean default false)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_row jsonb;
    v_res jsonb;
    v_total int := 0;
    v_changed int := 0;
    v_already int := 0;
    v_empty int := 0;
    v_sample jsonb := '[]'::jsonb;
    v_counts jsonb := '{}'::jsonb;
    v_key text;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行迁移';
    end if;

    for v_row in
        select to_jsonb (b)
        from public.buff_sets b
        order by b.entity_type, b.entity_name, b.buff_name
    loop
        v_total := v_total + 1;
        v_res := public.buff_set_upgrade_row_v2 (v_row);

        if coalesce ((v_res ->> 'already')::boolean, false) then
            v_already := v_already + 1;
            continue;
        end if;

        v_changed := v_changed + 1;
        if jsonb_array_length (coalesce (v_res -> 'row' -> 'buff_set', '[]'::jsonb)) = 0 then
            v_empty := v_empty + 1;
        end if;

        -- 按改动项累计计数（报告用）
        for v_key in select jsonb_array_elements_text (v_res -> 'changes')
        loop
            v_counts := jsonb_set (
                v_counts,
                array[v_key],
                to_jsonb (coalesce ((v_counts ->> v_key)::int, 0) + 1)
            );
        end loop;

        if jsonb_array_length (v_sample) < 20 then
            v_sample := v_sample || jsonb_build_array (
                jsonb_build_object (
                    'entity', (v_row ->> 'entity_type') || '/' || (v_row ->> 'entity_name') || '/' || (v_row ->> 'buff_name'),
                    'changes', v_res -> 'changes'
                )
            );
        end if;

        if not p_dry_run then
            update public.buff_sets
            set scope = v_res -> 'row' ->> 'scope',
                exclusive = (v_res -> 'row' ->> 'exclusive')::boolean,
                condition = v_res -> 'row' -> 'condition',
                buff_set = v_res -> 'row' -> 'buff_set'
            where entity_type = v_row ->> 'entity_type'
              and entity_name = v_row ->> 'entity_name'
              and buff_name = v_row ->> 'buff_name';
        end if;
    end loop;

    return jsonb_build_object (
        'version', 2,
        'dryRun', p_dry_run,
        'total', v_total,
        'changed', v_changed,
        'alreadyV2', v_already,
        'emptyZoneRows', v_empty,
        'changeCounts', v_counts,
        'sample', v_sample
    );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. 快照迁移：快照 state（行数组）同样升级，避免还原旧版本把老结构灌回线上
-- ─────────────────────────────────────────────────────────────
create or replace function public.migrate_buff_set_snapshots_v2 (p_dry_run boolean default false)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_rec record;
    v_state jsonb;
    v_next jsonb := '[]'::jsonb;
    v_res jsonb;
    v_snaps int := 0;
    v_snaps_changed int := 0;
    v_rows int := 0;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行迁移';
    end if;

    for v_rec in select id, state from public.buff_set_snapshot order by created_at
    loop
        v_snaps := v_snaps + 1;
        -- 只有**根快照**才有全量 state；版本快照的 state 恒为 NULL（见 check 约束 buff_set_snapshot_shape：
        -- root ⇒ state 非空 / 非 root ⇒ state 必须为 NULL）。所以这里不能顺手把 NULL 写成 '[]'，否则 23514。
        if v_rec.state is not null and jsonb_typeof (v_rec.state) = 'array' then
            v_next := '[]'::jsonb;
            for v_state in select value from jsonb_array_elements (v_rec.state)
            loop
                -- 非对象元素原样保留，避免把垃圾数据"升级"成空行
                if jsonb_typeof (v_state) <> 'object' then
                    v_next := v_next || jsonb_build_array (v_state);
                    continue;
                end if;
                v_rows := v_rows + 1;
                v_res := public.buff_set_upgrade_row_v2 (v_state);
                v_next := v_next || jsonb_build_array (coalesce (v_res -> 'row', v_state));
            end loop;

            if v_next is distinct from v_rec.state then
                v_snaps_changed := v_snaps_changed + 1;
                if not p_dry_run then
                    update public.buff_set_snapshot set state = v_next where id = v_rec.id;
                end if;
            end if;
        end if;
    end loop;

    return jsonb_build_object (
        'version', 2,
        'dryRun', p_dry_run,
        'snapshots', v_snaps,
        'snapshotsChanged', v_snaps_changed,
        'rows', v_rows
    );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. 还原兜底：先把要写入的状态升级到 v2，再交给原始 restore（同一事务）
--    不能改 restore_buff_set_snapshot 本身（它是快照链的语义边界）；
--    这里只做「入口升级」，因此旧快照也能被安全还原，不会把老结构灌回线上。
-- ─────────────────────────────────────────────────────────────
create or replace function public.restore_buff_set_snapshot_v2 (p_target uuid, p_state jsonb)
    returns int
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_rows jsonb := '[]'::jsonb;
    v_row jsonb;
    v_res jsonb;
    v_count int;
begin
    for v_row in select value from jsonb_array_elements (coalesce (p_state, '[]'::jsonb))
    loop
        v_res := public.buff_set_upgrade_row_v2 (v_row);
        v_rows := v_rows || jsonb_build_array (coalesce (v_res -> 'row', v_row));
    end loop;

    select public.restore_buff_set_snapshot (p_target, v_rows) into v_count;
    return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. 权限
-- ─────────────────────────────────────────────────────────────
grant execute on function public.buff_zone_ids_v2 () to authenticated;
grant execute on function public.buff_zone_alias_v2 (text) to authenticated;
grant execute on function public.buff_zone_no_override_v2 (text) to authenticated;
grant execute on function public.buff_zone_no_ref_v2 (text) to authenticated;
grant execute on function public.buff_ref_zone_ids_v2 () to authenticated;
grant execute on function public.buff_condition_v2 (jsonb) to authenticated;
grant execute on function public.buff_zone_list_v2 (jsonb, jsonb) to authenticated;
grant execute on function public.buff_set_upgrade_row_v2 (jsonb) to authenticated;
grant execute on function public.migrate_buff_sets_v2 (boolean) to authenticated;
grant execute on function public.migrate_buff_set_snapshots_v2 (boolean) to authenticated;
grant execute on function public.restore_buff_set_snapshot_v2 (uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. 首次应用时自动回填一次（幂等；只影响线上 buff_sets）
--     注意：这里不走 public.migrate_buff_sets_v2()，因为它带 admin 判定，
--     而 migration 执行上下文（SQL Editor / db push）里 auth.uid() 为 null。
--     migration 本身以库主身份执行，这里直接内联同一套升级函数。
--     之后可用管理页「Buff 集迁移」重新 dry-run / 补跑（新增行、还原后残留）。
-- ─────────────────────────────────────────────────────────────
do $$
declare
    v_row jsonb;
    v_res jsonb;
    v_total int := 0;
    v_changed int := 0;
    v_already int := 0;
    v_empty int := 0;
    v_samples jsonb := '[]'::jsonb;
    v_counts jsonb := '{}'::jsonb;
    v_key text;
begin
    if exists (select 1 from public.buff_set_migrations where version = 2) then
        return;
    end if;

    for v_row in select to_jsonb (b) from public.buff_sets b
    loop
        v_total := v_total + 1;
        v_res := public.buff_set_upgrade_row_v2 (v_row);

        if coalesce ((v_res ->> 'already')::boolean, false) then
            v_already := v_already + 1;
            continue;
        end if;

        v_changed := v_changed + 1;
        if jsonb_array_length (coalesce (v_res -> 'row' -> 'buff_set', '[]'::jsonb)) = 0 then
            v_empty := v_empty + 1;
        end if;

        for v_key in select jsonb_array_elements_text (v_res -> 'changes')
        loop
            v_counts := v_counts || jsonb_build_object (v_key, coalesce ((v_counts ->> v_key)::int, 0) + 1);
        end loop;

        if jsonb_array_length (v_samples) < 20 then
            v_samples := v_samples || jsonb_build_array (
                jsonb_build_object (
                    'entity', (v_row ->> 'entity_type') || '/' || (v_row ->> 'entity_name') || '/' || (v_row ->> 'buff_name'),
                    'changes', v_res -> 'changes'
                )
            );
        end if;

        update public.buff_sets
        set scope = v_res -> 'row' ->> 'scope',
            exclusive = (v_res -> 'row' ->> 'exclusive')::boolean,
            condition = v_res -> 'row' -> 'condition',
            buff_set = v_res -> 'row' -> 'buff_set'
        where entity_type = v_row ->> 'entity_type'
          and entity_name = v_row ->> 'entity_name'
          and buff_name = v_row ->> 'buff_name';
    end loop;

    -- 快照同样迁移（保留「按旧版本精确还原」的能力：还原后由 restore_*_v2 兜底）
    declare
        v_rec record;
        v_state jsonb;
        v_next jsonb;
        v_snaps int := 0;
        v_snaps_changed int := 0;
    begin
        for v_rec in select id, state from public.buff_set_snapshot loop
            v_snaps := v_snaps + 1;
            -- 同 migrate_buff_set_snapshots_v2：只有根快照有全量 state，版本快照的 state 必须保持 NULL
            if v_rec.state is not null and jsonb_typeof (v_rec.state) = 'array' then
                v_next := '[]'::jsonb;
                for v_state in select value from jsonb_array_elements (v_rec.state)
                loop
                    -- 非对象元素原样保留
                    if jsonb_typeof (v_state) <> 'object' then
                        v_next := v_next || jsonb_build_array (v_state);
                        continue;
                    end if;
                    v_next := v_next || jsonb_build_array (
                        coalesce ((public.buff_set_upgrade_row_v2 (v_state)) -> 'row', v_state)
                    );
                end loop;

                if v_next is distinct from v_rec.state then
                    v_snaps_changed := v_snaps_changed + 1;
                    update public.buff_set_snapshot set state = v_next where id = v_rec.id;
                end if;
            end if;
        end loop;

        insert into public.buff_set_migrations (version, name, applied_by, report)
        values (
            2,
            'buff_set_v2：乘区贡献条目列表 + 条件分层挂载',
            auth.uid (),
            jsonb_build_object (
                'version', 2,
                'total', v_total,
                'changed', v_changed,
                'alreadyV2', v_already,
                'emptyZoneRows', v_empty,
                'changeCounts', v_counts,
                'sample', v_samples,
                'snapshots', v_snaps,
                'snapshotsChanged', v_snaps_changed
            )
        )
        on conflict (version) do nothing;
    end;
end $$;


