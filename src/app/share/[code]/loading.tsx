export default function Loading() {
    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="h-4 w-24 animate-pulse rounded bg-(--card-hover)" />
            <div className="space-y-4 rounded-2xl border border-(--card-border) bg-(--card) p-6">
                <div className="h-8 w-2/3 animate-pulse rounded-md bg-(--card-hover)" />
                <div className="flex gap-2">
                    <div className="h-8 w-24 animate-pulse rounded-lg bg-(--card-hover)" />
                    <div className="h-8 w-20 animate-pulse rounded-lg bg-(--card-hover)" />
                </div>
                <div className="h-4 w-full animate-pulse rounded bg-(--card-hover)" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-(--card-hover)" />
            </div>
        </div>
    )
}
