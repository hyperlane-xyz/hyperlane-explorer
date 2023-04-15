import Image from 'next/image';

import { Spinner } from '../../../components/animation/Spinner';
import { ChainLogo } from '../../../components/icons/ChainLogo';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import MailUnknown from '../../../images/icons/mail-unknown.svg';
import { getMultiProvider } from '../../../multiProvider';
import { MessageStatus, MessageTx } from '../../../types';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { getChainDisplayName } from '../../chains/utils';
import { debugStatusToDesc } from '../../debugger/strings';
import { MessageDebugStatus } from '../../debugger/types';

import { KeyValueRow } from './KeyValueRow';

interface TransactionCardProps {
  title: string;
  chainId: ChainId;
  status: MessageStatus;
  transaction?: MessageTx;
  debugInfo?: TransactionCardDebugInfo;
  helpText: string;
  shouldBlur: boolean;
}

export interface TransactionCardDebugInfo {
  status: MessageDebugStatus;
  details: string;
  originChainId: ChainId;
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
  const hash = transaction?.hash;
  const txExplorerLink = hash ? getMultiProvider().tryGetExplorerTxUrl(chainId, { hash }) : null;
  return (
    <Card classes="flex-1 min-w-fit space-y-3">
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
            display={transaction.hash}
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
          <div className="text-gray-700 text-center">
            Destination delivery transaction currently failing
          </div>
          {debugInfo && (
            <>
              <div className="mt-4 text-gray-700 text-center">
                {debugStatusToDesc[debugInfo.status]}
              </div>
              <div className="mt-4 text-gray-700 text-sm max-w-sm text-center break-words">
                {debugInfo.details}
              </div>
            </>
          )}
        </div>
      )}
      {!transaction && status === MessageStatus.Pending && (
        <div className="flex flex-col items-center py-5">
          <div className="text-gray-500 text-center max-w-xs">
            Destination chain delivery transaction not yet found
          </div>
          <Spinner classes="mt-4 scale-75" />
        </div>
      )}
      {!transaction && status === MessageStatus.Unknown && (
        <div className="flex flex-col items-center py-5">
          <div className="text-gray-500 text-center max-w-xs">
            Destination transaction tracking is unavailable for this message, sorry!{' '}
          </div>
          <Image src={MailUnknown} alt="" width={60} height={60} className="mt-7" />
        </div>
      )}
    </Card>
  );
}
