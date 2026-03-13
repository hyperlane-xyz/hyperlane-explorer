import { MAILBOX_VERSION } from '@hyperlane-xyz/sdk';
import { formatMessage } from '@hyperlane-xyz/utils';
import { SelectField, Tooltip } from '@hyperlane-xyz/widgets';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useMultiProvider } from '../../../store';
import { Message } from '../../../types';
import { formatAddress } from '../../../utils/addresses';
import { logger } from '../../../utils/logger';
import { tryUtf8DecodeBytes } from '../../../utils/string';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';
import { CodeBlock, CollapsibleLabelAndCodeBlock } from './CodeBlock';
import { KeyValueRow } from './KeyValueRow';
import { BlockExplorerAddressUrls } from './types';

interface Props {
  message: Message;
  blur: boolean;
}

export function ContentDetailsCard({
  message: {
    msgId,
    nonce,
    originDomainId,
    destinationDomainId,
    sender,
    recipient,
    body,
    decodedBody,
    originChainId,
    destinationChainId,
  },
  blur,
}: Props) {
  const multiProvider = useMultiProvider();
  const [bodyDecodeType, setBodyDecodeType] = useState<string>(decodedBody ? 'utf8' : 'hex');
  const [blockExplorerAddressUrls, setBlockExplorerAddressUrls] = useState<
    BlockExplorerAddressUrls | undefined
  >(undefined);

  const formattedRecipient = formatAddress(recipient, destinationDomainId, multiProvider);
  const formattedSender = formatAddress(sender, originDomainId, multiProvider);

  useEffect(() => {
    if (decodedBody) setBodyDecodeType('utf8');
  }, [decodedBody]);
  const onChangeBodyDecode = (value: string) => {
    setBodyDecodeType(value);
  };

  const bodyDisplay = useMemo(() => {
    return (
      (bodyDecodeType === 'hex'
        ? body
        : decodedBody || tryUtf8DecodeBytes(body, false) || 'Unable to decode') || ''
    );
  }, [bodyDecodeType, decodedBody, body]);

  const rawBytes = useMemo(() => {
    try {
      if (!originDomainId || !destinationDomainId) return '';
      return formatMessage(
        MAILBOX_VERSION,
        nonce,
        originDomainId,
        sender,
        destinationDomainId,
        recipient,
        body,
      );
    } catch (error) {
      logger.warn('Error formatting message', error);
      return '';
    }
  }, [nonce, originDomainId, sender, destinationDomainId, recipient, body]);

  const getBlockExplorerLinks = useCallback(async (): Promise<
    BlockExplorerAddressUrls | undefined
  > => {
    const senderAddressLink = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      originChainId,
      formattedSender,
    );
    const recipientAddressLink = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      destinationChainId,
      formattedRecipient,
    );
    return { sender: senderAddressLink, recipient: recipientAddressLink };
  }, [destinationChainId, originChainId, multiProvider, formattedSender, formattedRecipient]);

  useEffect(() => {
    getBlockExplorerLinks()
      .then((urls) => setBlockExplorerAddressUrls(urls))
      .catch(() => setBlockExplorerAddressUrls(undefined));
  }, [getBlockExplorerLinks]);

  return (
    <SectionCard
      className="w-full"
      title="Message Details"
      icon={
        <Tooltip
          id="message-info"
          content="Immutable information about the message itself such as its contents."
        />
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6">
          <KeyValueRow
            label="Identifier:"
            labelWidth="w-20"
            display={msgId}
            showCopy={true}
            blurValue={blur}
            truncateMiddle={true}
          />
          <KeyValueRow
            label="Nonce:"
            labelWidth="w-20"
            display={nonce.toString()}
            blurValue={blur}
          />
          <KeyValueRow
            label="Sender:"
            labelWidth="w-20"
            display={formattedSender}
            showCopy={true}
            blurValue={blur}
            link={blockExplorerAddressUrls?.sender}
            truncateMiddle={true}
          />
          <KeyValueRow
            label="Recipient:"
            labelWidth="w-20"
            display={formattedRecipient}
            showCopy={true}
            blurValue={blur}
            link={blockExplorerAddressUrls?.recipient}
            truncateMiddle={true}
          />
        </div>
        <div>
          <div className="flex items-center">
            <label className="text-sm text-gray-500">Body:</label>
            <SelectField
              classes="w-14 h-6 py-0.5 ml-2 text-xs"
              options={decodeOptions}
              value={bodyDecodeType}
              onValueSelect={onChangeBodyDecode}
            />
          </div>
          <CodeBlock value={bodyDisplay} />
        </div>
        <CollapsibleLabelAndCodeBlock label="Raw bytes:" value={rawBytes} />
      </div>
    </SectionCard>
  );
}

const decodeOptions = [
  { value: 'hex', display: 'Hex' },
  { value: 'utf8', display: 'Utf-8' },
];
