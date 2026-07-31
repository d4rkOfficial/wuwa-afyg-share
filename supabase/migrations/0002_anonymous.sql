-- 椰果工坊 · 匿名分享支持
-- 椰果工具箱「分享(10分钟)」通过公开 API 匿名上传，不要求登录

alter table public.projects
    alter column author_id drop not null;
