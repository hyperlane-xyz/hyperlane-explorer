import { PropsWithChildren } from 'react';

interface Props {
  className?: string;
  padding?: string;
}

export function Card({ className, padding = 'p-4 sm:p-5', children }: PropsWithChildren<Props>) {
  return (
    <div className={`overflow-auto rounded-xl bg-white ${padding} ${className}`}>{children}</div>
  );
}
