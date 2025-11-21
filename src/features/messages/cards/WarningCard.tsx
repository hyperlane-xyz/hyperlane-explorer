import { ReactNode } from 'react';

type WarningLevel = 'error' | 'warning' | 'info';

interface WarningCardProps {
  level: WarningLevel;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

const levelStyles: Record<
  WarningLevel,
  { border: string; bg: string; titleColor: string; contentColor: string }
> = {
  error: {
    border: 'border-red-300',
    bg: 'bg-red-50',
    titleColor: 'text-red-800',
    contentColor: 'text-red-700',
  },
  warning: {
    border: 'border-yellow-300',
    bg: 'bg-yellow-50',
    titleColor: 'text-yellow-800',
    contentColor: 'text-yellow-700',
  },
  info: {
    border: 'border-blue-300',
    bg: 'bg-blue-50',
    titleColor: 'text-blue-800',
    contentColor: 'text-blue-700',
  },
};

export function WarningCard({ level, icon, title, children }: WarningCardProps) {
  const styles = levelStyles[level];

  return (
    <div className={`rounded-md border ${styles.border} ${styles.bg} px-4 py-3`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">{icon}</div>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium ${styles.titleColor}`}>{title}</h3>
          <div className={`mt-2 text-sm ${styles.contentColor}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
