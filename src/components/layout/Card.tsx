import { PropsWithChildren } from 'react';

interface Props {
  className?: string;
  padding?: string;
}

export function Card({ className, padding = 'p-4 sm:p-5', children }: PropsWithChildren<Props>) {
  return (
    <div
      className={`bg-white ring ring-blue-300 rounded-3xl overflow-auto ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
