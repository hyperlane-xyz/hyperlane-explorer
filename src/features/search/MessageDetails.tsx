import Image from 'next/future/image';

import { Spinner } from '../../components/animation/Spinner';
import { CopyButton } from '../../components/buttons/CopyButton';
import { ChainIcon } from '../../components/icons/ChainIcon';
import { ChainToChain } from '../../components/icons/ChainToChain';
import { HelpIcon } from '../../components/icons/HelpIcon';
import { Card } from '../../components/layout/Card';
import CheckmarkIcon from '../../images/icons/checkmark-circle.svg';
import XCircleIcon from '../../images/icons/x-circle.svg';
import { MOCK_MESSAGES } from '../../test/mockMessages';
import { MessageStatus } from '../../types';
import { shortenAddress } from '../../utils/addresses';
import { toShortened } from '../../utils/string';
import { getHumanReadableTimeString } from '../../utils/time';

export function MessageDetails({ messageId }: { messageId: string }) {
  const {
    status,
    sender,
    recipient,
    originTimeSent,
    originChainId,
    destinationChainId,
    originTransaction,
    destinationTransaction,
  } = MOCK_MESSAGES[0];

  return (
    <>
      <div className="flex items-center justify-between px-1 -mt-1">
        <h2 className="text-white text-lg">Message</h2>
        {status === MessageStatus.Pending && (
          <div className="flex items-center">
            <div className="text-white text-lg">Status: Pending</div>
            <Spinner classes="scale-50 filter-full-bright" />
          </div>
        )}
        {status === MessageStatus.Delivered && (
          <div className="flex items-center">
            <div className="text-white text-lg mr-2">Status: Delivered</div>
            <Image src={CheckmarkIcon} alt="checkmark" width={24} height={24} />
          </div>
        )}
        {status === MessageStatus.Failing && (
          <div className="flex items-center">
            <div className="text-white text-lg mr-3">Status: Failing</div>
            <Image src={XCircleIcon} alt="failure" width={30} height={30} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between mt-5 space-x-4">
        <Card classes="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative -top-px -left-0.5">
              <ChainIcon chainId={originChainId} />
            </div>
            <div className="flex items-center pb-1">
              <h3 className="text-gray-800 black-shadow mr-2">
                Origin Transaction
              </h3>
              <HelpIcon size={16} text="TODO" />
            </div>
          </div>
          <ValueRow
            label="Tx hash:"
            labelWidth="w-16"
            display={toShortened(originTransaction.transactionHash, 32)}
            copyValue={originTransaction.transactionHash}
          />
          <ValueRow
            label="From:"
            labelWidth="w-16"
            display={toShortened(originTransaction.from, 32)}
            copyValue={originTransaction.from}
          />
          <ValueRow
            label="Block:"
            labelWidth="w-16"
            display={`${
              originTransaction.blockNumber
            } (${getHumanReadableTimeString(originTimeSent)})`}
          />
          <a
            className="block text-sm text-gray-500 pl-px underline"
            href="TODO"
            target="_blank"
            rel="noopener noreferrer"
          >
            View in block explorer
          </a>
        </Card>
        <Card classes="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative -top-px -left-0.5">
              <ChainIcon chainId={destinationChainId} />
            </div>
            <div className="flex items-center pb-1">
              <h3 className="text-gray-800 black-shadow mr-2">
                Destination Transaction
              </h3>
              <HelpIcon size={16} text="TODO" />
            </div>
          </div>
          <ValueRow
            label="Tx hash:"
            labelWidth="w-16"
            display={toShortened(originTransaction.transactionHash, 32)}
            copyValue={originTransaction.transactionHash}
          />
          <ValueRow
            label="From:"
            labelWidth="w-16"
            display={toShortened(originTransaction.from, 32)}
            copyValue={originTransaction.from}
          />
          <ValueRow
            label="Block:"
            labelWidth="w-16"
            display={`${
              originTransaction.blockNumber
            } (${getHumanReadableTimeString(originTimeSent)})`}
          />
          <a
            className="block text-sm text-gray-500 pl-px underline"
            href="TODO"
            target="_blank"
            rel="noopener noreferrer"
          >
            View in block explorer
          </a>
        </Card>
      </div>
      <Card classes="mt-4">
        <ChainToChain
          originChainId={originChainId}
          destinationChainId={destinationChainId}
        />
        <div className="flex items-center justify-between flex-1">
          <div className={styles.valueContainer}>
            <div className={styles.label}>Sender</div>
            <div className={styles.value}>
              {shortenAddress(sender) || 'Invalid Address'}
            </div>
          </div>
          <div className="hidden sm:flex flex-col">
            <div className={styles.label}>Recipient</div>
            <div className={styles.value}>
              {shortenAddress(recipient) || 'Invalid Address'}
            </div>
          </div>
          <div className={styles.valueContainer + ' w-28'}>
            <div className={styles.label}>Time sent</div>
            <div className={styles.value}>
              {getHumanReadableTimeString(originTimeSent)}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

function ValueRow({
  label,
  labelWidth,
  display,
  copyValue,
}: {
  label: string;
  labelWidth: string;
  display: string;
  copyValue?: string;
}) {
  return (
    <div className="flex items-center pl-px">
      <label className={`text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <span className="text-sm ml-2">{display}</span>
      {copyValue && (
        <CopyButton
          copyValue={copyValue}
          width={15}
          height={15}
          classes="ml-3 opacity-50"
        />
      )}
    </div>
  );
}

const styles = {
  valueContainer: 'flex flex-col',
  label: 'text-sm text-gray-500',
  value: 'text-sm mt-1',
};
