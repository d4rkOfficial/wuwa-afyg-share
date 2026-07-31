-- 椰果工坊 · 自动清理过期工程（pg_cron，每 5 分钟）
-- 匿名 10 分钟分享与登录用户手动设置的过期工程统一在过期后物理删除，
-- 级联清理关联 likes，避免过期行永久残留占用存储/分享码。

create extension if not exists pg_cron;

-- 一次性清掉存量过期行
delete from public.projects
where expires_at is not null and expires_at < now();

-- 注册定时任务（幂等，已存在则跳过）
do $$
begin
    if not exists (select 1 from cron.job where jobname = 'cleanup-expired-projects') then
        perform cron.schedule(
            'cleanup-expired-projects',
            '*/5 * * * *',
            $cmd$ delete from public.projects where expires_at is not null and expires_at < now() $cmd$
        );
    end if;
end $$;
