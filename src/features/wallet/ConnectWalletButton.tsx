'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function ConnectWalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

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
            {(() => {
              if (!connected) {
                return (
                  <button onClick={openConnectModal} className={styles.button}>
                    Connect
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} className={styles.errorButton}>
                    Wrong network
                  </button>
                );
              }

              return (
                <button onClick={openAccountModal} className={styles.connectedButton}>
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

const styles = {
  button:
    'px-3 py-1.5 text-sm font-medium text-white bg-pink-500 rounded-lg hover:bg-pink-600 active:bg-pink-700 transition-all',
  connectedButton:
    'px-3 py-1.5 text-sm font-medium text-blue-500 bg-white rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all',
  errorButton:
    'px-3 py-1.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 active:bg-red-700 transition-all',
};
