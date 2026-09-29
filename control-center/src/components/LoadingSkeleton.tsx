import { cn } from '../lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}

/** Skeleton for a metric card while data loads. */
export function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-7 w-36" />
      <Skeleton className="mt-3 h-3 w-20" />
      <Skeleton className="mt-5 h-8 w-full" />
    </div>
  )
}

/** Skeleton for the main chart area. */
export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mt-5 h-64 w-full" />
    </div>
  )
}
