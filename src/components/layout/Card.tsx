import { PropsWithChildren } from 'react';

interface Props {
  className?: string;
  padding?: string;
}

export function Card({ className, padding = 'p-3 sm:p-4', children }: PropsWithChildren<Props>) {
  return (
    <div
      className={`overflow-auto rounded-xl bg-card-gradient shadow-card ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
