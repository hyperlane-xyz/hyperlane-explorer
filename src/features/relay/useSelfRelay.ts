import { useMutation } from '@tanstack/react-query';
import { providers } from 'ethers';
import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAccount, useSwitchChain } from 'wagmi';

import { Message, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { useRelayer } from './useRelayer';

interface SelfRelayParams {
  message: Message | MessageStub;
}

interface ProviderConnector {
  getProvider?: () => Promise<providers.ExternalProvider | providers.JsonRpcFetchFunc>;
}

async function getEthersSigner(connector?: ProviderConnector | null) {
  const provider = await connector?.getProvider?.();
  if (!provider) return null;
  return new providers.Web3Provider(provider).getSigner();
}

function getRelayError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown relay error';

  if (message.includes('Only built') && message.includes('required modules')) {
    return new Error(
      'Validator signatures not ready yet. Try again after validators have signed the message.',
    );
  }

  if (message.includes('required checkpoints')) {
    return new Error('Waiting for validator checkpoints. Try again in a few minutes.');
  }

  if (message.includes('Merkle proofs are not yet supported')) {
    return new Error(
      'Self-relay is not available for this message yet. Its destination ISM requires Merkle-proof metadata that the TS relayer cannot build yet.',
    );
  }

  if (message.includes('Unable to build metadata')) {
    return new Error(
      'Self-relay could not build destination metadata yet. Validators may still be publishing checkpoints, or this ISM path may not be supported yet.',
    );
  }

  return error instanceof Error ? error : new Error(message);
}

export function useSelfRelay() {
  const { relayer, evmMultiProvider, isReady } = useRelayer();
  const { address, chainId, connector, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const relayMessage = useCallback(
    async ({ message }: SelfRelayParams) => {
      if (!relayer || !evmMultiProvider) throw new Error('Relayer not initialized');
      if (!isConnected || !address || !connector) throw new Error('Wallet not connected');

      const destinationMetadata = evmMultiProvider.tryGetChainMetadata(message.destinationDomainId);
      if (!destinationMetadata) {
        throw new Error(`Unknown destination chain: ${message.destinationDomainId}`);
      }

      if (chainId !== destinationMetadata.chainId) {
        await switchChainAsync({ chainId: destinationMetadata.chainId });
      }

      const signer = await getEthersSigner(connector);
      if (!signer) throw new Error('Could not get wallet signer');

      const originChainName = evmMultiProvider.tryGetChainName(message.originDomainId);
      if (!originChainName) throw new Error(`Unknown origin chain: ${message.originDomainId}`);

      logger.debug(
        `Starting self-relay for message ${message.msgId} on ${destinationMetadata.name}`,
      );

      const originProvider = evmMultiProvider.getProvider(originChainName);
      const txReceipt = await originProvider.getTransactionReceipt(message.origin.hash);
      if (!txReceipt) {
        throw new Error(`Could not fetch transaction receipt for ${message.origin.hash}`);
      }

      evmMultiProvider.setSharedSigner(signer);

      try {
        const result = await relayer.relayMessage(txReceipt);
        logger.debug(`Self-relay completed for message ${message.msgId}`, result);
        return result;
      } catch (error) {
        logger.error(`Self-relay failed for message ${message.msgId}`, error);
        throw getRelayError(error);
      }
    },
    [address, chainId, connector, evmMultiProvider, isConnected, relayer, switchChainAsync],
  );

  const mutation = useMutation({
    mutationFn: relayMessage,
    onSuccess: () => {
      toast.success('Message relayed successfully');
    },
    onError: (error) => {
      toast.error(`Relay failed: ${getRelayError(error).message}`);
    },
  });

  return {
    relay: mutation.mutate,
    relayAsync: mutation.mutateAsync,
    isReady,
    isRelaying: mutation.isPending,
  };
}
