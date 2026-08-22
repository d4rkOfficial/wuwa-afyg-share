-- 0003_search_projects.sql
-- 工程多字段模糊搜索 RPC：title / description / author_name / tags / team_preview.names
-- ─────────────────────────────────────────────────────────────
-- 逐行拼出可搜文本串 blob，按空白分词后要求每个非空 token 都在 blob 中以子串命中
-- （strpos 字面量匹配，天然规避 LIKE 的 % _ 转义问题；lower() 兼容英文大小写）。
-- security definer：统一在函数内施加 published / author_id 过滤，公开读取无需依赖 RLS。
-- 返回 setof public.projects，调用方可继续 .select() 投影 / .range() 分页 / count。

create or replace function public.search_projects (
    p_q text default '',
    p_character text default '',
    p_sort text default 'latest'
)
returns setof public.projects
language plpgsql
security definer
set search_path = public as $$
declare
    v_tokens text[] := string_to_array(btrim(p_q), ' ');
begin
    return query
    select pj.*
    from public.projects pj
    cross join lateral (
        select (
            coalesce(pj.title, '') || ' '
            || coalesce(pj.description, '') || ' '
            || coalesce(pj.author_name, '') || ' '
            || coalesce(array_to_string(pj.tags, ' '), '') || ' '
            || coalesce((
                select string_agg(elem, ' ')
                from jsonb_array_elements_text(coalesce(pj.team_preview -> 'names', '[]'::jsonb)) elem
            ), '')
        ) as blob
    ) s
    where pj.published
      and pj.author_id is not null
      and (p_character = '' or pj.team_preview @> jsonb_build_object('names', jsonb_build_array(p_character)))
      and (
          coalesce(array_length(v_tokens, 1), 0) = 0
          or not exists (
              select 1
              from unnest(v_tokens) as tok
              where btrim(tok) <> ''
                and strpos(lower(s.blob), lower(tok)) = 0
          )
      )
    order by
        case when p_sort = 'hot' then pj.clone_count end desc,
        pj.created_at desc;
end;
$$;

grant execute on function public.search_projects (text, text, text) to anon, authenticated, service_role;
