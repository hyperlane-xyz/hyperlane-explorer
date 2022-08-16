import { PropsWithChildren } from 'react';

import { useIsSsr } from '../../utils/ssr';

export function ContentFrame(props: PropsWithChildren) {
  const isSsr = useIsSsr();
  if (isSsr) {
    // https://github.com/wagmi-dev/wagmi/issues/542#issuecomment-1144178142
    return null;
  }

  return (
    <div className="flex flex-col justify-center items-center min-h-full">
      <div
        style={{ width: 'min(900px,96vw)' }}
        className="relative overflow-visible mt-6 mb-8"
      >
        <div className="absolute -top-5 -left-4 -right-4 h-36 bg-green-600 rounded z-10"></div>
        <div className="relative z-20">{props.children}</div>
      </div>
    </div>
  );
}
