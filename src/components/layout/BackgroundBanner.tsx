import { WideChevron } from '@hyperlane-xyz/widgets';

import { useStore } from '../../store';
import { classNameToColor } from '../../styles/Color';

export function BackgroundBanner() {
  const bannerClassName = useStore((s) => s.bannerClassName);
  const colorClass = bannerClassName || 'bg-blue-500';

  return (
    <div
      className={`absolute -top-5 -left-4 -right-4 h-36 rounded z-10 transition-all duration-500 ${colorClass} overflow-visible`}
    >
      <Chevron pos="-left-11" color={classNameToColor(colorClass)} />
      <Chevron pos="-right-11" color={classNameToColor(colorClass)} />
    </div>
  );
}

function Chevron({ color, pos }: { color: string; pos: string }) {
  return (
    <div className={`absolute w-24 top-0 bottom-0 ${pos} overflow-visible`}>
      <WideChevron direction="e" color={color} height="100%" width="auto" rounded />
    </div>
  );
}
