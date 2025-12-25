import { useMutation } from '@tanstack/react-query';
import { providers } from 'ethers';
import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAccount } from 'wagmi';
import { Message } from '../../types';
import { logger } from '../../utils/logger';
import { useRelayer } from './useRelayer';

interface SelfRelayParams {
  message: Message;
}

function getEthersSigner(): providers.JsonRpcSigner | null {
  if (typeof window === 'undefined' || !window.ethereum) return null;
  // Cast to ExternalProvider for ethers v5 compatibility
  const provider = new providers.Web3Provider(window.ethereum as providers.ExternalProvider);
  return provider.getSigner();
}

export function useSelfRelay() {
  const { relayer, evmMultiProvider, isReady } = useRelayer();
  const { address, isConnected } = useAccount();

  const relayMessage = useCallback(
    async ({ message }: SelfRelayParams) => {
      if (!relayer || !evmMultiProvider) {
        throw new Error('Relayer not initialized');
      }

      if (!isConnected || !address) {
        throw new Error('Wallet not connected');
      }

      const signer = getEthersSigner();
      if (!signer) {
        throw new Error('Could not get wallet signer');
      }

      const { origin, msgId, destinationDomainId } = message;
      const destChainName = evmMultiProvider.tryGetChainName(destinationDomainId);

      if (!destChainName) {
        throw new Error(`Unknown destination chain: ${destinationDomainId}`);
      }

      logger.debug(`Starting self-relay for message ${msgId} to ${destChainName}`);

      const originChainName = evmMultiProvider.tryGetChainName(message.originDomainId);
      if (!originChainName) {
        throw new Error(`Unknown origin chain: ${message.originDomainId}`);
      }

      const originProvider = evmMultiProvider.getProvider(originChainName);
      const txReceipt = await originProvider.getTransactionReceipt(origin.hash);

      if (!txReceipt) {
        throw new Error(`Could not fetch transaction receipt for ${origin.hash}`);
      }

      evmMultiProvider.setSharedSigner(signer);

      try {
        const result = await relayer.relayMessage(txReceipt);
        logger.debug(`Self-relay completed for message ${msgId}`, result);
        return result;
      } catch (relayError: unknown) {
        const errorMessage =
          relayError instanceof Error ? relayError.message : 'Unknown relay error';
        logger.error(`Relay error for message ${msgId}:`, relayError);

        // Re-throw with a user-friendly message
        if (errorMessage.includes('Only built') && errorMessage.includes('required modules')) {
          throw new Error(
            'Validator signatures not yet available. The message may need more time for validators to sign.',
          );
        } else if (errorMessage.includes('required checkpoints')) {
          throw new Error('Waiting for validator checkpoints. Please try again in a few minutes.');
        }
        throw relayError;
      }
    },
    [relayer, evmMultiProvider, isConnected, address],
  );

  const mutation = useMutation({
    mutationFn: relayMessage,
    onSuccess: (data) => {
      toast.success('Message relayed successfully!');
      logger.debug('Relay transaction:', data);
    },
    onError: (error: Error) => {
      logger.error('Self-relay failed:', error);
      toast.error(`Relay failed: ${error.message}`);
    },
  });

  return {
    relay: mutation.mutate,
    relayAsync: mutation.mutateAsync,
    isRelaying: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    isReady: isReady && isConnected,
  };
}
