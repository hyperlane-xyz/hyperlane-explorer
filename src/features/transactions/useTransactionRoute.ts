import { useMemo } from 'react';

import { useChainMetadataResolver } from '../../metadataStore';
import { useStore } from '../../store';
import { IcaCall, Message, WarpRouteDetails } from '../../types';
import {
  DecodedIcaMessage,
  decodeIcaBody,
  decodeIcaCallData,
  decodeMulticallIcaCalls,
  IcaMessageType,
  isIcaMessage,
  useRevealCalls,
} from '../messages/ica';
import { parseWarpRouteMessageDetails } from '../messages/utils';

interface IcaCandidate {
  message: Message;
  decoded: DecodedIcaMessage;
  destinationChainName: string | undefined;
}

export type RouteOutput = (
  | { type: 'token'; address: string }
  | { type: 'native'; address?: undefined }
) & {
  outputAmount?: string;
  outputAmountKind?: 'exact' | 'minimum';
  wrappedNativeToken?: string;
  outputRecipients?: string[];
};

interface TransactionRoute {
  warpMessage: Message;
  warpDetails: WarpRouteDetails;
  destinationChainName: string | undefined;
  destinationDomainId: number;
  destinationTxHash: string | undefined;
  output: RouteOutput;
}

export function useTransactionRoute(messages: Message[]): TransactionRoute | undefined {
  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);

  const warpRoute = useMemo(() => {
    for (const message of messages) {
      const details = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );
      if (details) return { message, details };
    }
    return undefined;
  }, [chainMetadataResolver, messages, warpRouteChainAddressMap]);

  const icaCandidate = useMemo<IcaCandidate | undefined>(() => {
    let fallback: IcaCandidate | undefined;

    for (const message of messages) {
      if (!isIcaMessage({ sender: message.sender, recipient: message.recipient })) continue;
      const decoded = decodeIcaBody(message.body);
      if (!decoded) continue;

      const candidate = {
        message,
        decoded,
        destinationChainName:
          chainMetadataResolver.tryGetChainName(message.destinationDomainId) || undefined,
      };

      if (
        decoded.messageType === IcaMessageType.CALLS ||
        decoded.messageType === IcaMessageType.REVEAL
      ) {
        return candidate;
      }

      fallback ??= candidate;
    }

    return fallback;
  }, [chainMetadataResolver, messages]);

  const { data: revealCalls } = useRevealCalls(
    icaCandidate?.destinationChainName,
    icaCandidate?.message.destination?.hash,
    icaCandidate?.message.msgId,
    icaCandidate?.decoded.messageType,
  );

  return useMemo(() => {
    if (!warpRoute) return undefined;

    const calls =
      icaCandidate?.decoded.messageType === IcaMessageType.CALLS
        ? icaCandidate.decoded.calls
        : (revealCalls ?? []);
    const output = findSwapOutput(calls, icaCandidate?.destinationChainName, (domainId) => {
      return chainMetadataResolver.tryGetChainName(domainId) || undefined;
    });
    if (!output) return undefined;

    return {
      warpMessage: warpRoute.message,
      warpDetails: warpRoute.details,
      destinationChainName:
        icaCandidate?.destinationChainName ||
        chainMetadataResolver.tryGetChainName(warpRoute.message.destinationDomainId) ||
        undefined,
      destinationDomainId:
        icaCandidate?.message.destinationDomainId ?? warpRoute.message.destinationDomainId,
      destinationTxHash: icaCandidate?.message.destination?.hash,
      output,
    };
  }, [chainMetadataResolver, icaCandidate, revealCalls, warpRoute]);
}

function findSwapOutput(
  calls: IcaCall[],
  destinationChainName: string | undefined,
  tryGetChainName: (domainId: number) => string | undefined,
): RouteOutput | undefined {
  const expandedCalls = calls.flatMap((call) => [
    call,
    ...(decodeMulticallIcaCalls(call, destinationChainName) ?? []),
  ]);

  let output: RouteOutput | undefined;

  for (const call of expandedCalls) {
    const decoded = decodeIcaCallData(call.data, tryGetChainName);
    if (decoded?.swap) {
      output =
        decoded.swap.tokenOutType === 'native'
          ? {
              type: 'native',
              outputAmount: decoded.swap.outputAmount,
              outputAmountKind: decoded.swap.outputAmountKind,
              wrappedNativeToken: decoded.swap.wrappedNativeToken,
              outputRecipients: decoded.swap.outputRecipients,
            }
          : {
              type: 'token',
              address: decoded.swap.tokenOut,
              outputAmount: decoded.swap.outputAmount,
              outputAmountKind: decoded.swap.outputAmountKind,
              outputRecipients: decoded.swap.outputRecipients,
            };
    }
  }

  return output;
}
