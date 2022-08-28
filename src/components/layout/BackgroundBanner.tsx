import { createContext, useContext, useMemo, useState } from 'react';

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
  return (
    <div
      className={`absolute -top-5 -left-4 -right-4 h-36 rounded z-10 transition-all duration-500 ${
        bannerClassName || 'bg-green-600'
      }`}
    ></div>
  );
}
