'use client';

import { SpinnerIcon } from '@hyperlane-xyz/widgets';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useCallback, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { Message, MessageStatus } from '../../types';
import { useSelfRelay } from './useSelfRelay';

interface SelfRelayButtonProps {
  message: Message;
  disabled?: boolean;
}

export function SelfRelayButton({ message, disabled }: SelfRelayButtonProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { relay, isRelaying } = useSelfRelay();

  const isDelivered = message.status === MessageStatus.Delivered;
  const pendingRelayRef = useRef(false);

  // Trigger relay after wallet connects
  useEffect(() => {
    if (isConnected && pendingRelayRef.current) {
      pendingRelayRef.current = false;
      relay({ message });
    }
  }, [isConnected, relay, message]);

  const handleClick = useCallback(() => {
    if (!isConnected) {
      pendingRelayRef.current = true;
      openConnectModal?.();
      return;
    }
    relay({ message });
  }, [isConnected, openConnectModal, relay, message]);

  if (isDelivered) {
    return null;
  }

  return (
    <button
      onClick={handleClick}
      disabled={isRelaying || disabled}
      className="mt-3 flex items-center justify-center gap-2 rounded-md bg-pink-500 px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-pink-600 active:bg-pink-700 disabled:bg-gray-300 disabled:text-gray-500"
    >
      {isRelaying && <SpinnerIcon width={14} height={14} />}
      {isRelaying ? 'Relaying...' : 'Self Relay'}
    </button>
  );
}
