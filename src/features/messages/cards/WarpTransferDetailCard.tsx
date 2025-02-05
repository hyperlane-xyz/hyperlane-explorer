import { MultiProvider } from '@hyperlane-xyz/sdk';
import {
  bytesToProtocolAddress,
  fromHexString,
  fromWei,
  parseWarpRouteMessage,
} from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import { Card } from '../../../components/layout/Card';
import SendMoney from '../../../images/icons/send-money.svg';
import { useStore } from '../../../store';
import { Message, WarpRouteChainAddressMap, WarpRouteDetails } from '../../../types';
import { logger } from '../../../utils/logger';
import { getTokenSymbolFromWarpRouteChainAddressMap } from '../../../utils/token';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  blur: boolean;
}

export function WarpTransferDetailCard({ message, blur }: Props) {
  const { warpRouteChainAddressMap, multiProvider } = useStore((s) => ({
    warpRouteChainAddressMap: s.warpRouteChainAddressMap,
    multiProvider: s.multiProvider,
  }));
  const warpRouteDetails = parseWarpRouteDetails(message, warpRouteChainAddressMap, multiProvider);

  if (!warpRouteDetails) return null;

  const { amount, destinationTokenAddress, endRecipient, originTokenAddress, originTokenSymbol } =
    warpRouteDetails;

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
          showCopy={true}
          blurValue={blur}
        />
        <KeyValueRow
          label="Destination token:"
          labelWidth="w-20 sm:w-32"
          display={destinationTokenAddress}
          displayWidth="w-64 sm:w-96"
          showCopy={true}
          blurValue={blur}
        />

        <KeyValueRow
          label="End recipient:"
          labelWidth="w-20 sm:w-32"
          display={endRecipient}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
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

    const originTokenSymbol = getTokenSymbolFromWarpRouteChainAddressMap(
      originMetadata,
      to,
      warpRouteChainAddressMap,
    );
    const destinationTokenSymbol = getTokenSymbolFromWarpRouteChainAddressMap(
      destinationMetadata,
      recipient,
      warpRouteChainAddressMap,
    );

    // If token symbols are not found with the addresses, it means the message
    // is not a warp transfer between tokens known to the registry
    if (!originTokenSymbol || !destinationTokenSymbol) return undefined;

    const parsedMessage = parseWarpRouteMessage(body);
    const bytes = fromHexString(parsedMessage.recipient);
    const address = bytesToProtocolAddress(
      bytes,
      destinationMetadata.protocol,
      destinationMetadata.bech32Prefix,
    );

    return {
      amount: fromWei(parsedMessage.amount.toString(), originMetadata.nativeToken?.decimals || 18),
      endRecipient: address,
      originTokenAddress: to,
      originTokenSymbol: originTokenSymbol,
      destinationTokenAddress: recipient,
      destinationTokenSymbol: destinationTokenSymbol,
    };
  } catch (err) {
    logger.error('Error parsing warp route details:', err);
    return undefined;
  }
}
