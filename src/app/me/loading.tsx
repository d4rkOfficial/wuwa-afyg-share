import LoadingIndicator from '@/components/ui/loading-indicator'

export default function Loading() {
    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-6xl items-center justify-center">
            <LoadingIndicator label="加载我的工程…" />
        </div>
    )
}
