import { MultiProvider } from '@hyperlane-xyz/sdk';
import {
  bytesToProtocolAddress,
  fromBase64,
  fromHexString,
  fromWei,
  parseWarpRouteMessage,
  toBase64,
} from '@hyperlane-xyz/utils';
import { Message, MessageStub, WarpRouteChainAddressMap, WarpRouteDetails } from '../../types';
import { logger } from '../../utils/logger';
import { getTokenFromWarpRouteChainAddressMap } from '../../utils/token';

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  return toBase64(msg);
}

export function deserializeMessage<M extends MessageStub>(data: string | string[]): M | undefined {
  return fromBase64<M>(data);
}

export function parseWarpRouteMessageDetails(
  message: Message | MessageStub,
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
      amount: fromWei(
        parsedMessage.amount.toString(),
        Math.max(originToken.decimals, destinationToken.decimals) || 18,
      ),
      transferRecipient: address,
      originToken: originToken,
      destinationToken: destinationToken,
    };
  } catch (err) {
    logger.error(`Error parsing warp route details for ${message.id}:`, err);
    return undefined;
  }
}
