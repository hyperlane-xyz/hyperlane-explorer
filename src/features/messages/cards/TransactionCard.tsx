import BigNumber from 'bignumber.js';
import { PropsWithChildren, ReactNode, useState } from 'react';

import { MultiProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType, isAddress, isZeroish, strip0x } from '@hyperlane-xyz/utils';
import { Modal, Tooltip, useModal } from '@hyperlane-xyz/widgets';

import { Spinner } from '../../../components/animations/Spinner';
import { ChainLogo } from '../../../components/icons/ChainLogo';
import { Card } from '../../../components/layout/Card';
import { links } from '../../../consts/links';
import { useMultiProvider } from '../../../store';
import { MessageStatus, MessageTx } from '../../../types';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { ChainSearchModal } from '../../chains/ChainSearchModal';
import { getChainDisplayName, isEvmChain } from '../../chains/utils';
import { debugStatusToDesc } from '../../debugger/strings';
import { MessageDebugResult } from '../../debugger/types';

import { LabelAndCodeBlock } from './CodeBlock';
import { KeyValueRow } from './KeyValueRow';

export function OriginTransactionCard({
  chainId,
  domainId,
  transaction,
  blur,
}: {
  chainId: ChainId;
  domainId: DomainId;
  transaction: MessageTx;
  blur: boolean;
}) {
  return (
    <TransactionCard chainId={chainId} title="Origin Transaction" helpText={helpText.origin}>
      <TransactionDetails
        chainId={chainId}
        domainId={domainId}
        transaction={transaction}
        blur={blur}
      />
    </TransactionCard>
  );
}

export function DestinationTransactionCard({
  chainId,
  domainId,
  status,
  transaction,
  duration,
  debugResult,
  isStatusFetching,
  isPiMsg,
  blur,
}: {
  chainId: ChainId;
  domainId: DomainId;
  status: MessageStatus;
  transaction?: MessageTx;
  duration?: string;
  debugResult?: MessageDebugResult;
  isStatusFetching: boolean;
  isPiMsg?: boolean;
  blur: boolean;
}) {
  const multiProvider = useMultiProvider();
  const hasChainConfig = !!multiProvider.tryGetChainMetadata(chainId);

  const isDestinationEvmChain = isEvmChain(multiProvider, chainId);

  const { isOpen, open, close } = useModal();

  let content: ReactNode;
  if (transaction) {
    content = (
      <TransactionDetails
        transaction={transaction}
        chainId={chainId}
        domainId={domainId}
        duration={duration}
        blur={blur}
      />
    );
  } else if (!debugResult && isStatusFetching) {
    content = (
      <DeliveryStatus>
        <div>Checking delivery status and inspecting message</div>
        <Spinner classes="mt-4 scale-75" />
      </DeliveryStatus>
    );
  } else if (status === MessageStatus.Failing) {
    content = (
      <DeliveryStatus>
        <div className="text-sm leading-relaxed text-gray-800">{`Delivery to destination chain seems to be failing ${
          debugResult ? ': ' + debugStatusToDesc[debugResult.status] : ''
        }`}</div>
        {!!debugResult?.description && (
          <div className="mt-5 break-words text-center text-sm leading-relaxed text-gray-800">
            {debugResult.description}
          </div>
        )}
        <CallDataModal debugResult={debugResult} />
      </DeliveryStatus>
    );
  } else if (!hasChainConfig) {
    content = (
      <>
        <DeliveryStatus>
          <div className="flex flex-col items-center">
            <div>Delivery status is unknown.</div>
            <div className="mt-2 max-w-xs text-sm">
              Permissionless Interoperability (PI) chains require a config.
            </div>
            <div className="mb-6 mt-2 max-w-xs text-sm">
              Please{' '}
              <button className="underline underline-offset-2" onClick={open}>
                add metadata
              </button>{' '}
              for this chain.
            </div>
            <CallDataModal debugResult={debugResult} />
          </div>
        </DeliveryStatus>
        {/* TODO get modal to auto-close after adding chain metadata */}
        <ChainSearchModal isOpen={isOpen} close={close} showAddChainMenu={true} />
      </>
    );
  } else if (status === MessageStatus.Pending && isDestinationEvmChain) {
    content = (
      <DeliveryStatus>
        <div className="flex flex-col items-center">
          <div>Delivery to destination chain still in progress.</div>
          {isPiMsg && (
            <div className="mt-2 max-w-xs text-sm">
              Please ensure a relayer is running for this chain.
            </div>
          )}
          <Spinner classes="my-4 scale-75" />
          <CallDataModal debugResult={debugResult} />
        </div>
      </DeliveryStatus>
    );
  } else {
    content = (
      <DeliveryStatus>
        <div>Delivery to status is currently unknown.</div>
        <div className="mt-2 pb-4 text-sm">
          {isPiMsg
            ? 'Please ensure your chain config is correct and check back later.'
            : 'Please check again later'}
        </div>
      </DeliveryStatus>
    );
  }

  return (
    <TransactionCard
      chainId={chainId}
      title="Destination Transaction"
      helpText={helpText.destination}
    >
      {content}
    </TransactionCard>
  );
}

function TransactionCard({
  chainId,
  title,
  helpText,
  children,
}: PropsWithChildren<{ chainId: ChainId; title: string; helpText: string }>) {
  return (
    <Card className="flex min-w-fit flex-1 flex-col space-y-3">
      <div className="flex items-center justify-between">
        <div className="relative -left-0.5 -top-px">
          <ChainLogo chainId={chainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="mr-2 text-md font-medium text-blue-500">{title}</h3>
          <Tooltip
            id="transaction-info"
            content={helpText}
            size={16}
            className="hover:scale-105 hover:opacity-70"
            data-tooltip-place="top-start"
          />
        </div>
      </div>
      {children}
    </Card>
  );
}

function TransactionDetails({
  chainId,
  domainId,
  transaction,
  duration,
  blur,
}: {
  chainId: ChainId;
  domainId: DomainId;
  transaction: MessageTx;
  duration?: string;
  blur: boolean;
}) {
  const multiProvider = useMultiProvider();
  const protocol = multiProvider.tryGetProtocol(domainId) || ProtocolType.Ethereum;

  const { hash, from, timestamp, blockNumber, mailbox } = transaction;
  const formattedHash = protocol === ProtocolType.Cosmos ? strip0x(hash) : hash;

  const txExplorerLink =
    hash && !new BigNumber(hash).isZero()
      ? multiProvider.tryGetExplorerTxUrl(chainId, { hash: formattedHash })
      : null;

  return (
    <>
      <ChainDescriptionRow
        chainId={chainId}
        domainId={domainId}
        multiProvider={multiProvider}
        blur={blur}
      />
      <KeyValueRow
        label="Tx hash:"
        labelWidth="w-16"
        display={hash}
        displayWidth="w-60 sm:w-64"
        showCopy={true}
        blurValue={blur}
      />
      <KeyValueRow
        label="From:"
        labelWidth="w-16"
        display={from}
        displayWidth="w-60 sm:w-64"
        showCopy={true}
        blurValue={blur}
      />
      {mailbox && isAddress(mailbox) && !isZeroish(mailbox) && (
        <KeyValueRow
          label="Mailbox:"
          labelWidth="w-16"
          display={mailbox}
          displayWidth="w-60 sm:w-64"
          showCopy={true}
          blurValue={blur}
        />
      )}
      {!!timestamp && (
        <KeyValueRow
          label="Time:"
          labelWidth="w-16"
          display={getHumanReadableTimeString(timestamp)}
          subDisplay={`(${getDateTimeString(timestamp)})`}
          displayWidth="w-60 sm:w-64"
          blurValue={blur}
        />
      )}
      <KeyValueRow
        label="Block:"
        labelWidth="w-16"
        display={blockNumber?.toString()}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
      />
      {duration && (
        <KeyValueRow
          label="Duration:"
          labelWidth="w-16"
          display={duration}
          displayWidth="w-60 sm:w-64"
          blurValue={blur}
        />
      )}
      {txExplorerLink && (
        <a
          className={`block ${styles.textLink}`}
          href={txExplorerLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          View in block explorer
        </a>
      )}
    </>
  );
}

function DeliveryStatus({ children }: PropsWithChildren<unknown>) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center pb-2 text-center font-light text-gray-700">
        <div className="max-w-sm">{children}</div>
      </div>
    </>
  );
}

function CallDataModal({ debugResult }: { debugResult?: MessageDebugResult }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!debugResult?.calldataDetails) return null;
  const { contract, handleCalldata, mailbox } = debugResult.calldataDetails;
  return (
    <>
      <button onClick={() => setIsOpen(true)} className={`mt-5 ${styles.textLink}`}>
        View calldata details
      </button>
      <Modal isOpen={isOpen} close={() => setIsOpen(false)} panelClassname="max-w-lg p-4 sm:p-5">
        <div className="mt-2 flex flex-col space-y-3.5">
          <p className="text-sm font-light">
            {`The last step of message delivery is the recipient contract's 'handle' function. If the handle is reverting, try debugging it with `}
            <a
              className={`${styles.textLink} all:text-blue-500`}
              href={links.tenderlySimDocs}
              target="_blank"
              rel="noopener noreferrer"
            >
              Tenderly.
            </a>
            {` You can simulate the call in Tenderly by setting the following values:`}
          </p>
          <LabelAndCodeBlock label="From (Mailbox address):" value={mailbox} />
          <LabelAndCodeBlock label="To (Recipient contract address):" value={contract} />
          <LabelAndCodeBlock
            label="Calldata (handle function input calldata):"
            value={handleCalldata}
          />
        </div>
      </Modal>
    </>
  );
}

function ChainDescriptionRow({
  chainId,
  domainId,
  multiProvider,
  blur,
}: {
  chainId: ChainId;
  domainId: DomainId;
  multiProvider: MultiProvider;
  blur: boolean;
}) {
  const idString = chainId && chainId !== domainId ? `${chainId} / ${domainId}` : `${domainId}`;
  const chainDescription = `${getChainDisplayName(
    multiProvider,
    domainId,
    false,
    false,
  )} (${idString})`;
  return (
    <KeyValueRow
      label="Chain:"
      labelWidth="w-16"
      display={chainDescription}
      displayWidth="w-60 sm:w-64"
      blurValue={blur}
    />
  );
}

const helpText = {
  origin: 'Info about the transaction that initiated the message placement into the outbox.',
  destination:
    'Info about the transaction that triggered the delivery of the message from an inbox.',
};

const styles = {
  textLink:
    'text-sm text-gray-500 hover:text-gray-600 active:text-gray-700 underline underline-offset-1 transition-all',
};
