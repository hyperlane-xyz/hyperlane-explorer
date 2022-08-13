import { PropsWithChildren } from 'react';

export function ContentFrame(props: PropsWithChildren) {
  return (
    <div className="flex flex-col justify-center items-center min-h-full">
      <div
        style={{ width: 'min(900px,95vw)' }}
        className="relative overflow-visible my-8"
      >
        <div className="absolute -top-5 -left-4 -right-4 h-36 bg-green-500 rounded z-10"></div>
        <div className="relative z-20">{props.children}</div>
      </div>
    </div>
  );
}
