import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { WarpRouteChainAddressMap } from '@hyperlane-xyz/sdk/warp/read';
import { scalesEqual } from '@hyperlane-xyz/sdk';
import {
  bytesToProtocolAddress,
  fromBase64,
  fromHexString,
  fromWei,
  parseWarpRouteMessage,
  toBase64,
} from '@hyperlane-xyz/utils';

import { Message, MessageStub, WarpRouteDetails } from '../../types';
import { formatAddress } from '../../utils/addresses';
import { logger } from '../../utils/logger';
import { getTokenFromWarpRouteChainAddressMap } from '../../utils/token';
import { getEffectiveDecimals, getWarpRouteAmountParts } from '../../utils/warpRouteAmounts';

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  return toBase64(msg);
}

export function deserializeMessage<M extends MessageStub>(data: string | string[]): M | undefined {
  return fromBase64<M>(data);
}

export function parseWarpRouteMessageDetails(
  message: Message | MessageStub,
  warpRouteChainAddressMap: WarpRouteChainAddressMap,
  chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'>,
): WarpRouteDetails | undefined {
  try {
    const { body, sender, originDomainId, destinationDomainId, recipient } = message;

    const originMetadata = chainMetadataResolver.tryGetChainMetadata(originDomainId);
    const destinationMetadata = chainMetadataResolver.tryGetChainMetadata(destinationDomainId);

    if (!body || !originMetadata || !destinationMetadata) return undefined;

    const parsedSender = formatAddress(sender, originDomainId, chainMetadataResolver);
    const parsedRecipient = formatAddress(recipient, destinationDomainId, chainMetadataResolver);

    const originToken = getTokenFromWarpRouteChainAddressMap(
      originMetadata,
      parsedSender,
      warpRouteChainAddressMap,
    );
    const destinationToken = getTokenFromWarpRouteChainAddressMap(
      destinationMetadata,
      parsedRecipient,
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

    const effectiveDecimals = getEffectiveDecimals(originToken, destinationToken);

    const amountParts = getWarpRouteAmountParts(parsedMessage.amount, {
      decimals: effectiveDecimals,
      scale: originToken.scale,
    });
    const amount = fromWei(amountParts.amount.toString(), amountParts.decimals);

    // Compute destination amount when scales differ. Always use destinationToken.decimals
    // (not wireDecimals): after applying dest scale, the local amount is in dest's native
    // decimal space, which is how the receiving user sees their balance.
    let destAmount: string | null = null;
    if (!scalesEqual(originToken.scale, destinationToken.scale)) {
      const destAmountParts = getWarpRouteAmountParts(parsedMessage.amount, {
        decimals: destinationToken.decimals,
        scale: destinationToken.scale,
      });
      destAmount = fromWei(destAmountParts.amount.toString(), destAmountParts.decimals);
    }

    return {
      amount,
      destAmount,
      transferRecipient: address,
      originToken,
      destinationToken,
    };
  } catch (err) {
    logger.error(`Error parsing warp route details for ${message.id}:`, err);
    return undefined;
  }
}
