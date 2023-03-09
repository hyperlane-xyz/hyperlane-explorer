import { PropsWithChildren } from 'react';

interface Props {
  classes?: string;
}

export function Card({ classes, children }: PropsWithChildren<Props>) {
  return (
    <div className={`p-4 bg-white shadow border rounded overflow-auto ${classes}`}>{children}</div>
  );
}
