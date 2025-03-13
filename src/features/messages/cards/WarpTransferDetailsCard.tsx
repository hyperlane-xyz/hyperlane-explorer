import { MultiProvider } from '@hyperlane-xyz/sdk';
import {
  bytesToProtocolAddress,
  fromHexString,
  fromWei,
  parseWarpRouteMessage,
} from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../../../components/layout/Card';
import SendMoney from '../../../images/icons/send-money.svg';
import { useMultiProvider, useStore } from '../../../store';
import { Message, WarpRouteChainAddressMap, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
import { getTokenFromWarpRouteChainAddressMap } from '../../../utils/token';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';
import { KeyValueRow } from './KeyValueRow';
import { BlockExplorerAddressUrls } from './types';

interface Props {
  message: Message;
  blur: boolean;
}

export function WarpTransferDetailsCard({ message, blur }: Props) {
  const multiProvider = useMultiProvider();
  const { warpRouteChainAddressMap } = useStore((s) => ({
    warpRouteChainAddressMap: s.warpRouteChainAddressMap,
  }));
  const warpRouteDetails = useMemo(
    () => parseWarpRouteDetails(message, warpRouteChainAddressMap, multiProvider),
    [message, warpRouteChainAddressMap, multiProvider],
  );
  const [blockExplorerAddressUrls, setBlockExplorerAddressUrls] = useState<
    BlockExplorerAddressUrls | undefined
  >(undefined);

  const getBlockExplorerLinks = useCallback(async (): Promise<
    BlockExplorerAddressUrls | undefined
  > => {
    if (!warpRouteDetails) return undefined;

    const originToken = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.originChainId,
      warpRouteDetails.originTokenAddress,
    );
    const destinationToken = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.destinationChainId,
      warpRouteDetails.destinationTokenAddress,
    );
    const transferRecipient = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.destinationChainId,
      warpRouteDetails.transferRecipient,
    );
    return { destinationToken, originToken, transferRecipient };
  }, [message, multiProvider, warpRouteDetails]);

  useEffect(() => {
    getBlockExplorerLinks()
      .then((urls) => setBlockExplorerAddressUrls(urls))
      .catch(() => setBlockExplorerAddressUrls(undefined));
  }, [getBlockExplorerLinks]);

  if (!warpRouteDetails) return null;

  const {
    amount,
    destinationTokenAddress,
    transferRecipient,
    originTokenAddress,
    originTokenSymbol,
  } = warpRouteDetails;

  return (
    <Card className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Image src={SendMoney} width={28} height={28} alt="" className="opacity-80" />
        <div className="flex items-center pb-1">
          <h3 className="mr-2 text-md font-medium text-blue-500">Warp Transfer Details</h3>
          <Tooltip
            id="warp-route-info"
            content="Information about the warp route transfer such as the end recipient and amount transferred"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <KeyValueRow
          label="Amount:"
          labelWidth="w-20 sm:w-32"
          display={`${amount} ${originTokenSymbol}`}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          showCopy
        />
        <KeyValueRow
          label="Origin token:"
          labelWidth="w-20 sm:w-32"
          display={originTokenAddress}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.originToken}
          showCopy
        />
        <KeyValueRow
          label="Destination token:"
          labelWidth="w-20 sm:w-32"
          display={destinationTokenAddress}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.destinationToken}
          showCopy
        />
        <KeyValueRow
          label="Transfer recipient:"
          labelWidth="w-20 sm:w-32"
          display={transferRecipient}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.transferRecipient}
          showCopy
        />
      </div>
    </Card>
  );
}

export function parseWarpRouteDetails(
  message: Message,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
  multiProvider: MultiProvider,
): WarpRouteDetails | undefined {
  try {
    const {
      body,
      origin: { to },
      originDomainId,
      destinationDomainId,
      recipient,
    } = message;

    const originMetadata = multiProvider.tryGetChainMetadata(originDomainId);
    const destinationMetadata = multiProvider.tryGetChainMetadata(destinationDomainId);

    if (!body || !originMetadata || !destinationMetadata) return undefined;

    const originToken = getTokenFromWarpRouteChainAddressMap(
      originMetadata,
      to,
      warpRouteChainAddressMap,
    );
    const destinationToken = getTokenFromWarpRouteChainAddressMap(
      destinationMetadata,
      recipient,
      warpRouteChainAddressMap,
    );

    // If tokens are not found with the addresses, it means the message
    // is not a warp transfer between tokens known to the registry
    if (!originToken || !destinationToken) return undefined;

    const parsedMessage = parseWarpRouteMessage(body);
    const bytes = fromHexString(parsedMessage.recipient);
    const address = bytesToProtocolAddress(
      bytes,
      destinationMetadata.protocol,
      destinationMetadata.bech32Prefix,
    );

    return {
      amount: fromWei(parsedMessage.amount.toString(), originToken.decimals || 18),
      transferRecipient: address,
      originTokenAddress: to,
      originTokenSymbol: originToken.symbol,
      destinationTokenAddress: recipient,
      destinationTokenSymbol: destinationToken.symbol,
    };
  } catch (err) {
    logger.error('Error parsing warp route details:', err);
    return undefined;
  }
}
