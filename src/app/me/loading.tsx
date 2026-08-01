export default function Loading() {
    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div className="h-14 animate-pulse rounded-xl border border-(--card-border) bg-(--card)" />
            <div className="flex items-center justify-between">
                <div className="h-8 w-40 animate-pulse rounded-md bg-(--card-hover)" />
                <div className="h-9 w-28 animate-pulse rounded-lg bg-(--card-hover)" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: 3 }, (_, i) => (
                    <div
                        key={i}
                        className="h-24 animate-pulse rounded-xl border border-(--card-border) bg-(--card)"
                    />
                ))}
            </div>
        </div>
    )
}
