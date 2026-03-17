import Image from 'next/image';
import { PropsWithChildren } from 'react';

import LogoLockup from '/public/images/hyperlane-explorer-logo.svg';

export function AppLoadingShell({ children }: PropsWithChildren) {
  return (
    <div className="min-w-screen relative flex min-h-screen w-full flex-col bg-brand-gradient font-sans text-black">
      <div className="pointer-events-none absolute inset-0 z-0" style={styles.gridOverlay} />
      <header className="relative z-10 w-full bg-black/10 px-2 py-4 backdrop-blur-md sm:px-6 sm:py-5 lg:px-12">
        <div className="flex items-center">
          <Image src={LogoLockup} alt="Hyperlane Explorer" className="h-8 w-auto sm:h-10" />
        </div>
      </header>
      <div className="relative z-10 mx-auto w-full max-w-5xl grow">
        <main className="relative min-h-full pt-3" style={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}

const styles = {
  gridOverlay: {
    backgroundImage: 'url(/images/background.svg)',
    backgroundSize: '100% auto',
    backgroundRepeat: 'repeat',
    maskImage:
      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100vh, rgba(0,0,0,1) 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100vh, rgba(0,0,0,1) 100%)',
  } as React.CSSProperties,
  main: {
    width: 'min(900px,96vw)',
  },
};
