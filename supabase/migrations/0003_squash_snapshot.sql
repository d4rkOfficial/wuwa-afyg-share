-- ═══════════════════════════════════════════════════════════════
-- [升级] Buff 集快照：新增「合并到根」（squash）
-- 适用：已执行 0001_init.sql（或 0001 + 0002 升级）的线上库。
-- 全新库请直接执行 0001_init.sql（已含本功能），无需执行本文件。
--
-- 新能力：
--   合并快照（squash 到根）：以链尾重建的全量状态替换根 state，
--   清空全部版本节点，链压回单行（根）。用于版本过多、历史 diff 不再
--   需要时重置基准。仅管理员，单事务，幂等（无版本时仅刷新根 state）。
--
-- 与已有 restore 的区别：
--   restore 回写 buff_sets 表并级联删除比目标新的版本（git reset 语义）；
--   squash 不碰 buff_sets，只把快照链压平成单根，buff_sets 保持现状。
-- ═══════════════════════════════════════════════════════════════

create or replace function public.squash_buff_set_snapshot (p_state jsonb, p_note text default null)
    returns text
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_root_id uuid;
    v_versions int;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;
    if p_state is null then
        raise exception '缺少全量状态';
    end if;

    select id into v_root_id from public.buff_set_snapshot where is_root limit 1;
    if v_root_id is null then
        raise exception '暂无根快照';
    end if;

    select count(*) into v_versions
    from public.buff_set_snapshot
    where is_root = false;

    -- 删除全部版本节点（prev_id 链被 on delete cascade 自动清理级联引用）
    delete from public.buff_set_snapshot where is_root = false;

    -- 根以重建全量刷新基准；note 传入则覆盖，否则保留
    update public.buff_set_snapshot
    set state = p_state,
        diff = null,
        prev_id = null,
        note = coalesce (p_note, note)
    where id = v_root_id;

    return format ('已合并 %s 个版本到根', v_versions);
end;
$$;

grant execute on function public.squash_buff_set_snapshot (jsonb, text) to authenticated;

-- 验证：
--   select proname, args from pg_proc
--   where proname = 'squash_buff_set_snapshot';
