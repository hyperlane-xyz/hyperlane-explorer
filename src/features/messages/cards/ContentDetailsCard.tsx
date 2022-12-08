import { useEffect, useState } from 'react';

import { utils } from '@hyperlane-xyz/utils';

import { ChainToChain } from '../../../components/icons/ChainToChain';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { SelectField } from '../../../components/input/SelectField';
import { Card } from '../../../components/layout/Card';
import { Message } from '../../../types';
import { tryUtf8DecodeBytes } from '../parseMessage';

import { CodeBlock, LabelAndCodeBlock } from './CodeBlock';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  shouldBlur: boolean;
}

export function ContentDetailsCard({
  message: {
    msgId,
    nonce,
    originDomainId,
    originChainId,
    destinationDomainId,
    destinationChainId,
    sender,
    recipient,
    body,
    decodedBody,
  },
  shouldBlur,
}: Props) {
  const [bodyDecodeType, setBodyDecodeType] = useState<string>(decodedBody ? 'utf8' : 'hex');
  useEffect(() => {
    if (decodedBody) setBodyDecodeType('utf8');
  }, [decodedBody]);
  const onChangeBodyDecode = (value: string) => {
    setBodyDecodeType(value);
  };

  const bodyDisplay =
    bodyDecodeType === 'hex'
      ? body
      : decodedBody || tryUtf8DecodeBytes(body, false) || 'Unable to decode';

  const rawBytes = utils.formatMessage(
    originDomainId,
    sender,
    destinationDomainId,
    recipient,
    body,
  );

  return (
    <Card classes="w-full space-y-4">
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
        label="Message Id:"
        labelWidth="w-20"
        display={msgId}
        displayWidth="w-60 sm:w-80"
        showCopy={true}
        blurValue={shouldBlur}
      />
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
        label="Nonce:"
        labelWidth="w-20"
        display={nonce.toString()}
        blurValue={shouldBlur}
      />
      <div>
        <div className="flex items-center">
          <label className="text-sm text-gray-500">Message Content:</label>
          <SelectField
            classes="w-16 h-6 py-0.5 ml-3 mb-0.5"
            options={decodeOptions}
            value={bodyDecodeType}
            onValueSelect={onChangeBodyDecode}
          />
        </div>
        <CodeBlock value={bodyDisplay} />
      </div>
      <LabelAndCodeBlock label="Raw bytes:" value={rawBytes} />
    </Card>
  );
}

const decodeOptions = [
  { value: 'hex', display: 'Hex' },
  { value: 'utf8', display: 'Utf-8' },
];
