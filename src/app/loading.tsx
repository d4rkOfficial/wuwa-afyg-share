export default function Loading() {
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-7 w-40 animate-pulse rounded-none bg-(--card-hover)" />
                    <div className="h-4 w-64 animate-pulse rounded bg-(--card-hover)" />
                </div>
                <div className="h-10 w-64 animate-pulse rounded-none bg-(--card-hover)" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-44 animate-pulse rounded-none bg-(--card-hover)" />
                ))}
            </div>
        </div>
    )
}
