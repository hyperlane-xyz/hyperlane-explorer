import { isNullish } from '@hyperlane-xyz/utils';
import BigNumber from 'bignumber.js';

import { useChainMetadataResolver } from '../../../metadataStore';
import { MessageStatus, type Message, type MessageStub } from '../../../types';
import { formatDeliveryCost, formatUsd } from './gasPaymentSummary';
import { useNativeTokenUsdPrice } from './useNativeTokenUsdPrice';

export function DestinationExecutionCost({
  message,
  blur,
}: {
  message: Message | MessageStub;
  blur: boolean;
}) {
  const metadata = useChainMetadataResolver();
  const transaction = message.destination;
  const gasUsed = transaction && 'gasUsed' in transaction ? transaction.gasUsed : undefined;
  const effectiveGasPrice =
    transaction && 'effectiveGasPrice' in transaction ? transaction.effectiveGasPrice : undefined;
  const usdPrice = useNativeTokenUsdPrice(message.destinationDomainId, transaction?.timestamp);
  const destinationMetadata = metadata.tryGetChainMetadata(message.destinationDomainId);
  const decimals = destinationMetadata?.nativeToken?.decimals;
  const symbol = destinationMetadata?.nativeToken?.symbol ?? 'native token';
  const rawCost =
    !isNullish(gasUsed) && !isNullish(effectiveGasPrice)
      ? new BigNumber(gasUsed).times(effectiveGasPrice)
      : null;
  const cost =
    !isNullish(rawCost) && decimals !== undefined
      ? formatDeliveryCost(
          rawCost.toFixed(),
          destinationMetadata?.protocol,
          decimals,
          destinationMetadata?.name,
        )
      : null;
  const usdCost =
    !isNullish(cost) && !isNullish(usdPrice)
      ? formatUsd(new BigNumber(cost).times(usdPrice))
      : null;

  if (message.status !== MessageStatus.Delivered || isNullish(gasUsed)) return null;

  return (
    <div className="min-w-0 space-y-2 border-t border-gray-200 pt-3">
      <h4 className="text-xs font-medium text-gray-600">Transaction execution</h4>
      <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-xs">
        {!isNullish(cost) && (
          <div className="min-w-0">
            <dt className="text-gray-500">Gas cost:</dt>
            <dd
              className={`mt-1 break-all font-mono text-base font-medium text-primary-900 ${blur ? 'blur-xs' : ''}`}
            >
              {cost} {symbol}
              {usdCost && (
                <span className="ml-2 text-xs font-normal text-gray-500">({usdCost})</span>
              )}
            </dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="text-gray-500">Gas used:</dt>
          <dd className={`mt-1 break-all font-mono text-gray-700 ${blur ? 'blur-xs' : ''}`}>
            {gasUsed.toString()}
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-gray-500">
        Cost of the destination transaction; it may deliver multiple messages.
      </p>
    </div>
  );
}
