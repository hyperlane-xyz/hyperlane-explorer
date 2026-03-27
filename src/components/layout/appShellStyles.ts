export const appShellGridOverlayStyle: React.CSSProperties = {
  backgroundImage: 'url(/images/background.svg)',
  backgroundSize: '100% auto',
  backgroundRepeat: 'repeat',
  maskImage:
    'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100vh, rgba(0,0,0,1) 100%)',
  WebkitMaskImage:
    'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100vh, rgba(0,0,0,1) 100%)',
};

export const appShellMainStyle: React.CSSProperties = {
  width: 'min(900px,96vw)',
};
