import { utils } from '@hyperlane-xyz/utils';

import { ChainToChain } from '../../../components/icons/ChainToChain';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { Message } from '../../../types';

import { HexStringBlock } from './HexStringBlock';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  shouldBlur: boolean;
}

export function ContentDetailsCard({
  message: {
    originDomainId,
    originChainId,
    destinationDomainId,
    destinationChainId,
    sender,
    recipient,
    leafIndex,
    body,
    hash,
  },
  shouldBlur,
}: Props) {
  const rawBytes = utils.formatMessage(
    originDomainId,
    sender,
    destinationDomainId,
    recipient,
    body,
  );
  return (
    <Card classes="mt-2 space-y-4" width="w-full">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <ChainToChain originChainId={originChainId} destinationChainId={destinationChainId} />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">Message Details</h3>
          <HelpIcon
            size={16}
            text="Immutable information about the message itself such as its contents."
          />
        </div>
      </div>
      <KeyValueRow
        label="Sender:"
        labelWidth="w-20"
        display={sender}
        displayWidth="w-60 sm:w-80"
        showCopy={true}
        blurValue={shouldBlur}
      />
      <KeyValueRow
        label="Recipient:"
        labelWidth="w-20"
        display={recipient}
        displayWidth="w-60 sm:w-80"
        showCopy={true}
        blurValue={shouldBlur}
      />
      <KeyValueRow
        label="Leaf index:"
        labelWidth="w-20"
        display={leafIndex.toString()}
        displayWidth="w-60 sm:w-80"
        blurValue={shouldBlur}
      />
      <HexStringBlock label="Message content:" value={body} />
      <HexStringBlock label="Raw bytes:" value={rawBytes} />
      <HexStringBlock label="Message hash:" value={hash} />
    </Card>
  );
}
