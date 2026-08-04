-- ─────────────────────────────────────────────────────────────
-- [0002] buff_sets.condition 生效条件列
-- buff 生效条件：jsonb {"type":"chain"|"refinement","min":n}
--   chain = 角色共鸣链 ≥ min（0-6）；refinement = 武器精炼 ≥ min（1-5）
-- 幂等：已加过列则跳过
-- ─────────────────────────────────────────────────────────────
alter table public.buff_sets
    add column if not exists condition jsonb;
