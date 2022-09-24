import { PropsWithChildren } from 'react';

import { BackgroundBanner } from './BackgroundBanner';

export function ContentFrame(props: PropsWithChildren) {
  return (
    <div className="flex flex-col justify-center items-center min-h-full">
      <div style={styles.container} className="relative overflow-visible mt-7 mb-8">
        <BackgroundBanner />
        <div className="relative z-20">{props.children}</div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: 'min(900px,96vw)',
  },
};
