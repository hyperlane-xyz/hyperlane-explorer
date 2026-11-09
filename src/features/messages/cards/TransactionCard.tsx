import { Modal, SpinnerIcon, useModal } from '@hyperlane-xyz/widgets';
import dynamic from 'next/dynamic';
import { PropsWithChildren, ReactNode, useEffect, useState } from 'react';

import { links } from '../../../consts/links';
import { useMultiProvider } from '../../../store';
import { Color } from '../../../styles/Color';
import {
  Message,
  MessageStatus,
  MessageStub,
  MessageTx,
  MessageTxStub,
  WarpRouteDetails,
} from '../../../types';
import { MessageDebugResult } from '../../debugger/types';
import { CollateralInfo } from '../collateral/types';
import { useCollateralStatus } from '../collateral/useCollateralStatus';
import { LabelAndCodeBlock } from './CodeBlock';
import { DestinationExecutionCost } from './DestinationExecutionCost';
import { TransactionDetailsRows } from './TransactionDetailsRows';
import { TransactionRecordCard, transactionHelpText } from './TransactionRecordCard';

const ChainSearchModal = dynamic(() =>
  import('../../chains/ChainSearchModal').then((mod) => mod.ChainSearchModal),
);

export function DestinationTransactionCard({
  chainName,
  domainId,
  status,
  transaction,
  debugResult,
  isStatusFetching,
  isOriginConfirming = false,
  isPiMsg,
  blur,
  message,
  warpRouteDetails,
  onCollateralInfoChange,
}: {
  chainName: string;
  domainId: DomainId;
  status: MessageStatus;
  transaction?: MessageTx | MessageTxStub;
  debugResult?: MessageDebugResult;
  isStatusFetching: boolean;
  isOriginConfirming?: boolean;
  isPiMsg?: boolean;
  blur: boolean;
  message?: Message | MessageStub;
  warpRouteDetails?: WarpRouteDetails;
  onCollateralInfoChange?: (info: CollateralInfo) => void;
}) {
  const multiProvider = useMultiProvider();
  const hasChainConfig = !!multiProvider.tryGetChainMetadata(domainId);
  const collateralInfo = useCollateralStatus(message, warpRouteDetails);

  const { isOpen, open, close } = useModal();

  useEffect(() => {
    onCollateralInfoChange?.({
      status: collateralInfo.status,
      available: collateralInfo.available,
      required: collateralInfo.required,
      deficit: collateralInfo.deficit,
    });
  }, [
    collateralInfo.status,
    collateralInfo.available,
    collateralInfo.required,
    collateralInfo.deficit,
    onCollateralInfoChange,
  ]);

  let content: ReactNode;
  if (transaction) {
    content = (
      <>
        <TransactionDetailsRows
          chainName={chainName}
          domainId={domainId}
          transaction={transaction}
          blur={blur}
          resolver={multiProvider}
        />
        {message && <DestinationExecutionCost message={message} blur={blur} />}
      </>
    );
  } else if (status === MessageStatus.Delivered) {
    content = (
      <DeliveryStatus>
        <div>Message delivered.</div>
        <div className="mt-2 text-sm font-light text-gray-500">
          Transaction details are still being indexed.
        </div>
      </DeliveryStatus>
    );
  } else if (isOriginConfirming) {
    content = (
      <DeliveryStatus>
        <div>Waiting for origin confirmations.</div>
        <div className="mt-2 text-sm font-light text-gray-500">
          Delivery can proceed once the origin confirmation threshold is reached.
        </div>
        <div className="mt-3 flex items-center justify-center">
          <SpinnerIcon width={24} height={24} color={Color.primaryDark} />
        </div>
      </DeliveryStatus>
    );
  } else if (!debugResult && isStatusFetching) {
    content = (
      <DeliveryStatus>
        <div>Checking delivery status and inspecting message</div>
        <div className="mt-3 flex items-center justify-center">
          <SpinnerIcon width={24} height={24} color={Color.primaryDark} />
        </div>
      </DeliveryStatus>
    );
  } else if ([MessageStatus.Pending, MessageStatus.Failing].includes(status)) {
    content = (
      <DeliveryStatus>
        <div>Delivery to destination chain still in progress.</div>
        {isPiMsg && (
          <div className="mt-2 max-w-xs text-sm">
            Please ensure a relayer is running for this chain.
          </div>
        )}
        <div className="mt-3 flex items-center justify-center">
          <SpinnerIcon width={24} height={24} color={Color.primaryDark} />
        </div>
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
            <div className="mt-2 mb-6 max-w-xs text-sm">
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
        {isOpen && <ChainSearchModal isOpen={isOpen} close={close} showAddChainMenu={true} />}
      </>
    );
  } else {
    content = (
      <DeliveryStatus>
        <div>Delivery status is currently unknown.</div>
        <div className="mt-2 pb-4 text-sm">
          {isPiMsg
            ? 'Please ensure your chain config is correct and check back later.'
            : 'Please check again later'}
        </div>
      </DeliveryStatus>
    );
  }

  return (
    <TransactionRecordCard
      chainName={chainName}
      domainId={domainId}
      title="Delivery transaction"
      helpText={transactionHelpText.destination}
    >
      {content}
    </TransactionRecordCard>
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
              className={`${styles.textLink} all:text-primary-600`}
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

const styles = {
  textLink:
    'text-sm text-gray-500 hover:text-gray-600 active:text-gray-700 underline underline-offset-1 transition-all',
};
