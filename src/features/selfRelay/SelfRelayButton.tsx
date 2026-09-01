import { errorToString } from '@hyperlane-xyz/utils';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccount, sendTransaction, switchChain, waitForTransactionReceipt } from '@wagmi/core';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { useAccount, useConfig } from 'wagmi';

import { SolidButton } from '../../components/buttons/SolidButton';
import type { Message, MessageStub } from '../../types';
import { useIsWalletReady } from '../wallet/EvmWalletContext';
import { SelfRelayPrepareError, getSelfRelayRefetchInterval } from './polling';
import { getRelayTransactionError, type RelayReplacementReason } from './transactionOutcome';
import { type SelfRelayPrepareRequest, SelfRelayPrepareResponseSchema } from './types';

type RelayStep = 'idle' | 'preparing' | 'switching' | 'signing' | 'confirming';

export function SelfRelayButton({ message }: { message: Message | MessageStub }) {
  const account = useAccount();
  const isWalletReady = useIsWalletReady();
  const wagmiConfig = useConfig();
  const { openConnectModal } = useConnectModal();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<RelayStep>('idle');
  const isBusy = step !== 'idle';
  const prepareRequest: SelfRelayPrepareRequest = {
    messageId: message.msgId,
    originDomainId: message.originDomainId,
    originTxHash: message.origin.hash,
  };
  const prepareQuery = useQuery({
    queryKey: ['selfRelayEligibility', message.msgId, message.origin.hash],
    queryFn: () => prepareSelfRelay(prepareRequest),
    refetchInterval: (query) =>
      getSelfRelayRefetchInterval(query.state.error, query.state.fetchFailureCount),
    retry: false,
  });

  const relay = async () => {
    if (!isWalletReady) {
      toast.info('Wallet connection is still loading.');
      return;
    }
    if (!account.isConnected) {
      openConnectModal?.();
      return;
    }

    try {
      setStep('preparing');
      const result = await prepareSelfRelay(prepareRequest);
      if (result.status === 'delivered') {
        toast.info('This message has already been delivered.');
        await queryClient.invalidateQueries({ queryKey: ['messageDeliveryStatus'] });
        return;
      }

      const currentAccount = getAccount(wagmiConfig);
      if (currentAccount.chainId !== result.destinationChainId) {
        setStep('switching');
        await switchChain(wagmiConfig, { chainId: result.destinationChainId });
      }

      setStep('signing');
      const hash = await sendTransaction(wagmiConfig, {
        chainId: result.destinationChainId,
        to: result.mailboxAddress,
        data: result.calldata,
      });

      setStep('confirming');
      let replacementReason: RelayReplacementReason | undefined;
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        chainId: result.destinationChainId,
        hash,
        confirmations: 1,
        onReplaced: (replacement) => {
          replacementReason = replacement.reason;
        },
      });
      const transactionError = getRelayTransactionError(receipt.status, replacementReason);
      if (transactionError) throw transactionError;
      toast.success(`Message relayed on ${result.destinationChainName}.`);
      await queryClient.invalidateQueries({ queryKey: ['messageDeliveryStatus'] });
    } catch (error) {
      toast.error(errorToString(error, 180));
    } finally {
      setStep('idle');
    }
  };

  if (prepareQuery.isPending) {
    return (
      <p className="mt-4 text-center text-xs text-gray-500">Checking self-relay availability…</p>
    );
  }
  if (prepareQuery.isError) {
    return (
      <p className="mt-4 text-center text-xs text-gray-500">
        Self-relay unavailable: {errorToString(prepareQuery.error, 160)}
      </p>
    );
  }
  if (prepareQuery.data.status === 'delivered') return null;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4 text-center">
      <p className="mb-3 text-xs leading-relaxed text-gray-600">
        Submit Mailbox.process on {prepareQuery.data.destinationChainName}. Your wallet pays
        destination gas; Hyperlane security checks still apply.
      </p>
      <SolidButton
        color="primary"
        classes="mx-auto min-w-48 px-5 py-2 text-sm"
        disabled={isBusy || !isWalletReady}
        onClick={relay}
        passThruProps={{ 'aria-busy': isBusy }}
      >
        {getButtonLabel(account.isConnected, step, prepareQuery.data.destinationChainName)}
      </SolidButton>
    </div>
  );
}

async function prepareSelfRelay(request: SelfRelayPrepareRequest) {
  const response = await fetch('/api/self-relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const result = SelfRelayPrepareResponseSchema.parse(await response.json());
  if (!response.ok || result.status === 'error') {
    throw new SelfRelayPrepareError(
      result.status === 'error' ? result.error : 'Unable to prepare relay',
      response.status,
    );
  }
  return result;
}

function getButtonLabel(isConnected: boolean, step: RelayStep, destinationChainName: string) {
  if (!isConnected) return 'Connect wallet to relay';
  if (step === 'preparing') return 'Preparing metadata…';
  if (step === 'switching') return 'Switching network…';
  if (step === 'signing') return 'Confirm in wallet…';
  if (step === 'confirming') return 'Confirming relay…';
  return `Self-relay on ${destinationChainName}`;
}
