import { Card } from '../../components/layout/Card';

export function MessageSearchLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex w-full items-center rounded bg-white p-1">
        <div className="h-10 flex-1 rounded bg-gray-100 sm:h-12" />
        <div className="ml-1 h-10 w-10 rounded bg-accent-600/80 sm:h-12 sm:w-12" />
      </div>

      <Card className="relative mt-4 min-h-[38rem] w-full" padding="">
        <div className="flex items-center justify-between px-2 pb-3 pt-3.5 sm:px-4 md:px-5">
          <div className="h-6 w-32 rounded bg-gray-200" />
          <div className="flex items-center gap-2 md:gap-4">
            <div className="h-8 w-20 rounded border border-accent-600/40 bg-accent-50/40" />
            <div className="h-8 w-24 rounded border border-accent-600/40 bg-accent-50/40" />
            <div className="h-8 w-16 rounded border border-accent-600/40 bg-accent-50/40" />
            <div className="h-8 w-20 rounded border border-accent-600/40 bg-accent-50/40" />
          </div>
        </div>

        <div className="px-3 pb-3 sm:px-4 md:px-5">
          <div className="hidden grid-cols-[1.2fr_1.2fr_1.6fr_1.6fr_1.4fr_1fr_1.4fr_24px] gap-4 border-b border-gray-100 pb-3 text-xs font-medium uppercase tracking-wide text-gray-500 sm:grid" />
          <div className="space-y-2 py-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1.2fr_1.2fr_1.6fr_1.6fr_1.4fr_1fr_1.4fr_24px] items-center gap-4 border-b border-primary-50 py-2 last:border-0"
              >
                <div className="h-5 w-20 rounded bg-gray-200" />
                <div className="h-5 w-20 rounded bg-gray-200" />
                <div className="h-5 w-28 rounded bg-gray-100" />
                <div className="h-5 w-28 rounded bg-gray-100" />
                <div className="h-5 w-24 rounded bg-gray-100" />
                <div className="h-5 w-16 rounded bg-gray-100" />
                <div className="h-5 w-24 rounded bg-gray-100" />
                <div className="h-5 w-5 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
