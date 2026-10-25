import LoadingIndicator from '@/components/ui/loading-indicator'

export default function Loading() {
    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-4xl items-center justify-center">
            <LoadingIndicator label="加载工程…" />
        </div>
    )
}
