import { Card } from '../../components/layout/Card';
import { SectionCard } from '../../components/layout/SectionCard';

export function MessageDetailsLoading() {
  return (
    <div>
      <div className="flex items-center justify-between rounded bg-accent-gradient px-3 py-3 shadow-accent-glow">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-cream-300/70" />
          <div className="h-6 w-52 animate-pulse rounded bg-white/20" />
        </div>
        <div className="h-6 w-36 animate-pulse rounded bg-white/20" />
      </div>

      <div className="mt-3 flex flex-wrap items-stretch justify-between gap-3 md:mt-4 md:gap-4">
        <DetailSectionSkeleton className="flex min-w-[340px] flex-1 basis-0 flex-col" rows={4} />
        <DetailSectionSkeleton className="flex min-w-[340px] flex-1 basis-0 flex-col" rows={5} />
        <DetailSectionSkeleton className="w-full" rows={4} />
        <DetailSectionSkeleton className="w-full" rows={4} />
      </div>
    </div>
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
