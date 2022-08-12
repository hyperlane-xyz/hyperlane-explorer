import { PropsWithChildren } from 'react';

export function ContentFrame(props: PropsWithChildren) {
  return (
    <div className="flex flex-col justify-center items-center h-full">
      <div
        style={{ width: 'min(1024px,95vw)' }}
        className="relative overflow-visible"
      >
        <div className="absolute -top-6 -left-6 -right-6 h-36 bg-green-500 rounded z-10"></div>
        <div className="relative z-20">{props.children}</div>
      </div>
    </div>
  );
}
