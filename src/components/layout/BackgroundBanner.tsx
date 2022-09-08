import { createContext, useContext, useMemo, useState } from 'react';

import { classNameToColor } from '../../styles/Color';
import { WideChevronIcon } from '../icons/WideChevron';

export const BannerColorContext = createContext<{
  bannerClassName: string;
  setBannerClassName?: (name: string) => void;
}>({ bannerClassName: '', setBannerClassName: undefined });

export function useBackgroundBannerState() {
  // State for managing banner class, to be used as context value
  const [bannerClassName, setBannerClassName] = useState('');
  const bannerState = useMemo(
    () => ({ bannerClassName, setBannerClassName }),
    [bannerClassName, setBannerClassName],
  );
  return bannerState;
}

export function useBackgroundBanner() {
  return useContext(BannerColorContext);
}

export function BackgroundBanner() {
  const { bannerClassName } = useBackgroundBanner();
  const colorClass = bannerClassName || 'bg-blue-500';

  return (
    <div
      className={`absolute -top-5 -left-4 -right-4 h-36 rounded z-10 transition-all duration-500 ${colorClass}`}
    >
      <Chevron pos="-left-11" color={classNameToColor(colorClass)} />
      <Chevron pos="-right-11" color={classNameToColor(colorClass)} />
    </div>
  );
}

function Chevron({ color, pos }: { color: string; pos: string }) {
  return (
    <div className={`absolute top-0 bottom-0 ${pos}`}>
      <WideChevronIcon direction="e" color={color} height="100%" width="auto" />
    </div>
  );
}
