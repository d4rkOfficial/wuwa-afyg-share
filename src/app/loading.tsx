function CardSkeleton() {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-(--card-border) bg-(--card) p-4">
            <div className="h-5 w-3/4 animate-pulse rounded-md bg-(--card-hover)" />
            <div className="flex gap-2">
                <div className="h-7 w-20 animate-pulse rounded-lg bg-(--card-hover)" />
                <div className="h-7 w-24 animate-pulse rounded-lg bg-(--card-hover)" />
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-(--card-hover)" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-(--card-hover)" />
        </div>
    )
}

export default function Loading() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1 space-y-2">
                    <div className="h-7 w-40 animate-pulse rounded-md bg-(--card-hover)" />
                    <div className="h-4 w-72 animate-pulse rounded-md bg-(--card-hover)" />
                </div>
                <div className="flex gap-2">
                    <div className="h-9 w-56 animate-pulse rounded-lg bg-(--card-hover)" />
                    <div className="h-9 w-16 animate-pulse rounded-lg bg-(--card-hover)" />
                </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <CardSkeleton key={i} />
                ))}
            </div>
        </div>
    )
}
