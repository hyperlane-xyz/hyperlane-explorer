import { PropsWithChildren, ReactNode } from 'react';

interface Props {
  className?: string;
  title: string;
  icon?: ReactNode;
}

export function SectionCard({ className, title, icon, children }: PropsWithChildren<Props>) {
  return (
    <div className={`overflow-hidden rounded bg-card-gradient shadow-card ${className}`}>
      {/* Gradient Header */}
      <div className="bg-accent-gradient px-3 py-1.5 shadow-accent-glow">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-cream-300" />
          <span className="text-sm font-medium text-white">{title}</span>
          {icon && <div className="ml-auto">{icon}</div>}
        </div>
      </div>
      {/* Content */}
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}
