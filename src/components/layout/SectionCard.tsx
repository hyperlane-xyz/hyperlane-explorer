import { PropsWithChildren, ReactNode } from 'react';

interface Props {
  className?: string;
  title: string;
  titleSize?: 'sm' | 'md';
  icon?: ReactNode;
  leading?: ReactNode;
}

export function SectionCard({
  className,
  title,
  titleSize = 'sm',
  icon,
  leading,
  children,
}: PropsWithChildren<Props>) {
  return (
    <section className={`overflow-auto rounded bg-card-gradient shadow-card ${className || ''}`}>
      {/* Muted Gray Header */}
      <div className="bg-gray-150 px-3 py-2">
        <div className="flex items-center gap-2">
          {leading || <div className="h-2 w-2 rounded-full bg-primary-400" />}
          <span
            className={`font-medium text-gray-700 ${titleSize === 'md' ? 'text-base' : 'text-sm'}`}
          >
            {title}
          </span>
          {icon && <div className="ml-auto">{icon}</div>}
        </div>
      </div>
      {/* Content */}
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}
