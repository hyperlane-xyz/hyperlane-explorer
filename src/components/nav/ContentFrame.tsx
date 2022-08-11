import { PropsWithChildren } from 'react';

export function ContentFrame(props: PropsWithChildren) {
  return (
    <div className="flex flex-col justify-center items-center h-full">
      <div
        style={{ width: 'min(1024px,95vw)' }}
        className="relative overflow-visible"
      >
        <div className="absolute -top-4 -left-4 -right-4 h-32 bg-green-500 rounded-sm z-10"></div>
        {props.children}
      </div>
    </div>
  );
}
