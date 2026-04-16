import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';

import { Message, MessageStatus, MessageStub } from '../../types';
import { useSelfRelay } from './useSelfRelay';

export function SelfRelayButton({
  message,
  disabled,
}: {
  message: Message | MessageStub;
  disabled?: boolean;
}) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { isReady, isRelaying, relay } = useSelfRelay();
  const pendingRelayRef = useRef(false);

  useEffect(() => {
    if (!isConnected || !pendingRelayRef.current || !isReady) return;
    pendingRelayRef.current = false;
    relay({ message });
  }, [isConnected, isReady, message, relay]);

  const onClick = useCallback(() => {
    if (!isConnected) {
      pendingRelayRef.current = true;
      openConnectModal?.();
      return;
    }

    relay({ message });
  }, [isConnected, message, openConnectModal, relay]);

  if (message.status === MessageStatus.Delivered) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isRelaying || !isReady}
      className="mt-4 flex items-center justify-center gap-2 rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:opacity-80 active:opacity-70 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
    >
      {isRelaying && <SpinnerIcon width={14} height={14} />}
      {isRelaying ? 'Relaying...' : 'Self relay'}
    </button>
  );
}
