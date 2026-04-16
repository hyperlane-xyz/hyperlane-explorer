import { ConnectButton } from '@rainbow-me/rainbowkit';

export function ConnectWalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && !!account && !!chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {!connected ? (
              <button type="button" onClick={openConnectModal} className={styles.button}>
                CONNECT
              </button>
            ) : chain.unsupported ? (
              <button type="button" onClick={openChainModal} className={styles.errorButton}>
                WRONG NETWORK
              </button>
            ) : (
              <button type="button" onClick={openAccountModal} className={styles.connectedButton}>
                {account.displayName}
              </button>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

const styles = {
  button:
    'rounded border border-white bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:opacity-80 active:opacity-70',
  connectedButton:
    'rounded border border-white/30 bg-white px-3 py-1.5 text-sm font-medium text-primary-600 transition-all hover:bg-white/90 active:bg-white/80',
  errorButton:
    'rounded border border-red-400 bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-red-600 active:bg-red-700',
};
