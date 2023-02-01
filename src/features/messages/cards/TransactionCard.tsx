import { ChainLogo } from '@hyperlane-xyz/widgets';

import { Spinner } from '../../../components/animation/Spinner';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { MessageStatus, PartialTransactionReceipt } from '../../../types';
import { getChainDisplayName } from '../../../utils/chains';
import { getTxExplorerUrl } from '../../../utils/explorers';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { debugStatusToDesc } from '../../debugger/strings';
import { MessageDebugStatus } from '../../debugger/types';

import { KeyValueRow } from './KeyValueRow';

interface TransactionCardProps {
  title: string;
  chainId: number;
  status: MessageStatus;
  transaction?: PartialTransactionReceipt;
  debugInfo?: TransactionCardDebugInfo;
  helpText: string;
  shouldBlur: boolean;
}

export interface TransactionCardDebugInfo {
  status: MessageDebugStatus;
  details: string;
  originChainId: number;
  originTxHash: string;
}

export function TransactionCard({
  title,
  chainId,
  status,
  transaction,
  debugInfo,
  helpText,
  shouldBlur,
}: TransactionCardProps) {
  const txExplorerLink = getTxExplorerUrl(chainId, transaction?.transactionHash);
  return (
    <Card classes="flex-1 min-w-fit space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <ChainLogo chainId={chainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">{title}</h3>
          <HelpIcon size={16} text={helpText} />
        </div>
      </div>
      {transaction && (
        <>
          <KeyValueRow
            label="Chain:"
            labelWidth="w-16"
            display={`${getChainDisplayName(chainId)} (${chainId})`}
            displayWidth="w-60 sm:w-64"
            blurValue={shouldBlur}
          />
          <KeyValueRow
            label="Tx hash:"
            labelWidth="w-16"
            display={transaction.transactionHash}
            displayWidth="w-60 sm:w-64"
            showCopy={true}
            blurValue={shouldBlur}
          />
          <KeyValueRow
            label="From:"
            labelWidth="w-16"
            display={transaction.from}
            displayWidth="w-60 sm:w-64"
            showCopy={true}
            blurValue={shouldBlur}
          />
          <KeyValueRow
            label="Time:"
            labelWidth="w-16"
            display={getHumanReadableTimeString(transaction.timestamp)}
            subDisplay={`(${getDateTimeString(transaction.timestamp)})`}
            displayWidth="w-60 sm:w-64"
            blurValue={shouldBlur}
          />
          <KeyValueRow
            label="Block:"
            labelWidth="w-16"
            display={transaction.blockNumber.toString()}
            displayWidth="w-60 sm:w-64"
            blurValue={shouldBlur}
          />
          {txExplorerLink && (
            <a
              className="block text-sm text-gray-500 pl-px underline"
              href={txExplorerLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              View in block explorer
            </a>
          )}
        </>
      )}
      {!transaction && status === MessageStatus.Failing && (
        <div className="flex flex-col items-center py-5">
          <div className="text-gray-500 text-center">
            Destination delivery transaction currently failing
          </div>
          {debugInfo && (
            <>
              <div className="mt-4 text-gray-500 text-center">
                {debugStatusToDesc[debugInfo.status]}
              </div>
              <div className="mt-4 text-gray-500 text-sm max-w-sm text-center break-words">
                {debugInfo.details}
              </div>
            </>
          )}
        </div>
      )}
      {!transaction && status === MessageStatus.Pending && (
        <div className="flex flex-col items-center py-5">
          <div className="text-gray-500">Destination chain delivery transaction not yet found</div>
          <Spinner classes="mt-4 scale-75" />
        </div>
      )}
    </Card>
  );
}
