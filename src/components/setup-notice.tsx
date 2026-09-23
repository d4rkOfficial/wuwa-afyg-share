export default function SetupNotice() {
    return (
        <div className="mg-card mx-auto max-w-lg p-8 text-center">
            <p className="mg-title text-lg">服务尚未配置</p>
            <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                请在项目根目录创建{' '}
                <code className="rounded-none border border-(--card-border) bg-(--card-hover) px-1.5 py-0.5">
                    .env.local
                </code>{' '}
                并填入 Supabase 凭据（参考 .env.example），然后执行
                <code className="mx-1 rounded-none border border-(--card-border) bg-(--card-hover) px-1.5 py-0.5">
                    supabase/migrations/0001_init.sql
                </code>{' '}
                建表。
            </p>
        </div>
    )
}
