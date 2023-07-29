import { PropsWithChildren, ReactNode, useState } from 'react';
import { Spinner } from '../../../components/animations/Spinner';
import { ChainLogo } from '../../../components/icons/ChainLogo';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { Modal } from '../../../components/layout/Modal';
import { links } from '../../../consts/links';
import { Message, MessageStatus, MessageTx } from '../../../types';
import { getDateTimeString, getHumanReadableTimeString } from '../../../utils/time';
import { getChainDisplayName } from '../../chains/utils';
import { debugStatusToDesc } from '../../debugger/strings';
import { MessageDebugResult } from '../../debugger/types';
import { useMultiProvider } from '../../providers/multiProvider';
import { LabelAndCodeBlock } from './CodeBlock';
import { KeyValueRow } from './KeyValueRow';

export function OriginTransactionCard({
  chainId,
  transaction,
  blur,
}: {
  chainId: ChainId;
  transaction: MessageTx;
  blur: boolean;
}) {
  return (
    <TransactionCard chainId={chainId} title="Origin Transaction" helpText={helpText.origin}>
      <TransactionDetails chainId={chainId} transaction={transaction} blur={blur} />
    </TransactionCard>
  );
}

export function DestinationTransactionCard({
  chainId,
  status,
  transaction,
  debugResult,
  isStatusFetching,
  isPiMsg,
  blur,
  message
}: {
  chainId: ChainId;
  status: MessageStatus;
  transaction?: MessageTx;
  debugResult?: MessageDebugResult;
  isStatusFetching: boolean;
  isPiMsg?: boolean;
  blur: boolean;
  message:Message;
}) {
  let content: ReactNode;
  if (transaction) {
    content = <TransactionDetails chainId={chainId} transaction={transaction} blur={blur} />;
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
        <div className="text-sm text-gray-800 leading-relaxed">{`Delivery to destination chain seems to be failing ${
          debugResult ? ': ' + debugStatusToDesc[debugResult.status] : ''
        }`}</div>
        {!!debugResult?.description && (
          <div className="mt-5 text-sm text-gray-800 text-center leading-relaxed break-words">
            {debugResult.description}
          </div>
        )}
        <CallDataModal debugResult={debugResult} chainId={chainId} message={message} />
      </DeliveryStatus>
    );
  } else if (status === MessageStatus.Pending) {
    content = (
      <DeliveryStatus>
        <div className="flex flex-col items-center">
          <div>Delivery to destination chain still in progress.</div>
          {isPiMsg && (
            <div className="mt-2 text-gray-700 text-sm max-w-xs">
              Please ensure a relayer is running for this chain.
            </div>
          )}
          <Spinner classes="my-4 scale-75" />
          <CallDataModal debugResult={debugResult} chainId={chainId} message={message}/>
        </div>
      </DeliveryStatus>
    );
  } else {
    content = (
      <DeliveryStatus>
        <div className="text-gray-700">{`Delivery to status is currently unknown. ${
          isPiMsg
            ? 'Please ensure your chain config is correct and check back later.'
            : 'Please check again later'
        }`}</div>
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
    <Card className="flex flex-col flex-1 min-w-fit space-y-3">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <ChainLogo chainId={chainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-blue-500 font-medium text-md mr-2">{title}</h3>
          <HelpIcon size={16} text={helpText} />
        </div>
      </div>
      {children}
    </Card>
  );
}

function TransactionDetails({
  chainId,
  transaction,
  blur,
}: {
  chainId: ChainId;
  transaction: MessageTx;
  blur: boolean;
}) {
  const { hash, from, timestamp, blockNumber } = transaction;
  const multiProvider = useMultiProvider();
  const txExplorerLink = hash ? multiProvider.tryGetExplorerTxUrl(chainId, { hash }) : null;
  return (
    <>
      <KeyValueRow
        label="Chain:"
        labelWidth="w-16"
        display={`${getChainDisplayName(multiProvider, chainId)} (${chainId})`}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
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
      <KeyValueRow
        label="Time:"
        labelWidth="w-16"
        display={getHumanReadableTimeString(timestamp)}
        subDisplay={`(${getDateTimeString(timestamp)})`}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
      />
      <KeyValueRow
        label="Block:"
        labelWidth="w-16"
        display={blockNumber?.toString()}
        displayWidth="w-60 sm:w-64"
        blurValue={blur}
      />
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
    <div className="pb-2 flex-1 flex flex-col items-center justify-center text-gray-500 font-light text-center">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

function CallDataModal({ debugResult,chainId,message}: { debugResult?: MessageDebugResult,chainId:ChainId,message:Message }) {
  const [isOpen, setIsOpen] = useState(false);
  const [disabled,setDisabled]=useState(false)
  const [buttonText,setButtonText]=useState("Simulate call with Tenderly")
  const [showSpinner,setShowSpinner]=useState(false)
  if (!debugResult?.calldataDetails) return null;
  const { contract, handleCalldata } = debugResult.calldataDetails;
  
  const handleClick=async()=>{
    setButtonText('Simulating');
    setDisabled(true)
    setShowSpinner(true)
    await simulateCall({contract,handleCalldata,chainId,message})
    setDisabled(false)
    setShowSpinner(false)
    setButtonText('Simulate call with Tenderly')
  }
  return (
    <>
      <button onClick={() => setIsOpen(true)} className={`mt-5 ${styles.textLink}`}>
        View calldata details
      </button>
      <Modal
        isOpen={isOpen}
        title="Message Delivery Calldata"
        close={() => setIsOpen(false)}
        maxWidth="max-w-sm sm:max-w-md"
      >
        <div className="mt-2 flex flex-col space-y-3.5">
          <p className="text-sm font-light">
            {`The last step of message delivery is the recipient contract's 'handle' function. If the handle reverting, try debugging it with `}
            <a
              className={`${styles.textLink} any:text-blue-500`}
              href={links.tenderlySimDocs}
              target="_blank"
              rel="noopener noreferrer"
            >
              Tenderly.
            </a>
          </p>
          <LabelAndCodeBlock label="Recipient contract address:" value={contract} />
          <LabelAndCodeBlock label="Handle function input calldata:" value={handleCalldata} />
          <button onClick={handleClick}
            disabled={disabled}
            className='underline text-blue-400'
          >
            {buttonText}
          </button>
          {showSpinner && <Spinner classes="mt-4 scale-75 self-center" />}
        </div>
      </Modal>
    </>
  );
}
async function simulateCall({contract,handleCalldata,chainId,message}:{contract:string,handleCalldata:string,chainId:ChainId,message:Message}){

  const data={
        save: true,
        save_if_fails: true, 
        simulation_type: 'full',
        network_id: chainId, 
        from: '0x0000000000000000000000000000000000000000',//can be any address, doesn't matter
        to: contract,
        input:handleCalldata,
        gas: Number(message.totalGasAmount),
        gas_price: Number(message.totalPayment)/Number(message.totalGasAmount),
        value: 0,
  }
  const resp=await fetch(
    `http://localhost:3000/api/simulation`,{
      method:'POST',
      body:JSON.stringify(data),
    }
  )
 
  const simulationId=await resp.json()
  window.open(`https://dashboard.tenderly.co/shared/simulation/${simulationId}`)
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
