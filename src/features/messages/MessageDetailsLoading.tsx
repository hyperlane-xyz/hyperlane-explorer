import { Card } from '../../components/layout/Card';
import { SectionCard } from '../../components/layout/SectionCard';

export function MessageDetailsLoading() {
  return (
    <section
      className="mx-auto w-full max-w-5xl space-y-4"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading message details"
    >
      <div
        className="overflow-hidden rounded-xl border border-gray-200 bg-white"
        aria-hidden="true"
      >
        <div className="space-y-3 bg-primary-900 p-5 sm:p-6">
          <div className="h-3 w-36 rounded bg-white/20 motion-safe:animate-pulse" />
          <div className="h-7 w-64 max-w-full rounded bg-white/30 motion-safe:animate-pulse" />
          <div className="h-3 w-72 max-w-full rounded bg-white/20 motion-safe:animate-pulse" />
        </div>
        <div className="p-4 sm:p-5">
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {[0, 1].map((side) => (
              <div key={side} className="space-y-4">
                <div className="h-7 w-40 rounded bg-gray-100 motion-safe:animate-pulse" />
                <div className="h-10 w-52 max-w-full rounded bg-gray-200 motion-safe:animate-pulse" />
                <div className="h-4 w-44 rounded bg-gray-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
          <div className="mt-6 h-12 rounded bg-gray-100 motion-safe:animate-pulse" />
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-gray-200 pt-5 sm:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((stage) => (
              <div key={stage} className="h-12 rounded bg-gray-100 motion-safe:animate-pulse" />
            ))}
          </div>
        </div>
      </div>
      <div className="h-20 rounded-xl bg-white/90 motion-safe:animate-pulse" aria-hidden="true" />
      <span className="sr-only">Loading message details</span>
    </section>
  );
}

export function DetailSectionSkeleton({
  className,
  rows = 3,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <SectionCard className={className} title="Loading">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-4 flex-1 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function DetailCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-24 animate-pulse rounded bg-gray-100" />
      </div>
    </Card>
  );
}
