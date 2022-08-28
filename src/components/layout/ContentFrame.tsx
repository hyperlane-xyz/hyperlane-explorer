import { PropsWithChildren } from 'react';

import {
  BackgroundBanner,
  BannerColorContext,
  useBackgroundBannerState,
} from './BackgroundBanner';

export function ContentFrame(props: PropsWithChildren) {
  // Provide context so children can change banner color
  const bannerState = useBackgroundBannerState();

  return (
    <div className="flex flex-col justify-center items-center min-h-full">
      <div
        style={styles.container}
        className="relative overflow-visible mt-7 mb-8"
      >
        <BannerColorContext.Provider value={bannerState}>
          <BackgroundBanner />
          <div className="relative z-20">{props.children}</div>
        </BannerColorContext.Provider>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: 'min(900px,96vw)',
  },
};
