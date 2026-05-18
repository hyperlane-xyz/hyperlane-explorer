import { ProtocolType, isEVMLike } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { Contract, utils } from 'ethers';
import { useMemo } from 'react';
import { useQuery as useUrqlQuery } from 'urql';

import { useChainMetadataResolver } from '../../../metadataStore';
import { useReadyMultiProvider, useRegistry } from '../../../store';
import { logger } from '../../../utils/logger';
import { useScrapedDomains } from '../../chains/queries/useScrapedChains';
import { isPiChain } from '../../chains/utils';
import { PiQueryType, fetchMessagesFromPiChain } from '../pi-queries/fetchPiChainMessages';
import { MessageIdentifierType, buildMessageQuery } from '../queries/build';
import { MessagesStubQueryResult } from '../queries/fragments';
import { parseMessageStubResult } from '../queries/parse';
import { decodeIcaBody } from './body';
import { fetchRevealCalls } from './reveal';
import { computeIcaAddress, getIcaRouterAddress, isIcaMessage } from './routers';
import { IcaMessageType } from './types';

/**
 * React hook to check if a message is an ICA message
 */
export function useIsIcaMessage({
  sender,
  recipient,
}: {
  sender: Address;
  recipient: Address;
}): boolean {
  return useMemo(() => isIcaMessage({ sender, recipient }), [sender, recipient]);
}

/**
 * Hook to fetch the derived ICA address for a given owner on the destination chain.
 * Uses the InterchainAccountRouter's getLocalInterchainAccount function.
 *
 * The ICA address is derived from: origin domain, owner, router, ISM, and salt.
 */
export function useIcaAddress(
  originChainName: string | undefined,
  destinationChainName: string | undefined,
  owner: Address | undefined,
  ism: Address | undefined,
  salt: string | undefined,
) {
  const multiProvider = useReadyMultiProvider();
  const chainMetadataResolver = useChainMetadataResolver();

  return useQuery({
    queryKey: [
      'icaAddress',
      originChainName,
      destinationChainName,
      owner,
      ism,
      salt,
      !!multiProvider,
    ],
    queryFn: async () => {
      if (
        !originChainName ||
        !destinationChainName ||
        !owner ||
        !multiProvider ||
        !isEVMLike(
          chainMetadataResolver.tryGetProtocol(destinationChainName) ?? ProtocolType.Unknown,
        )
      ) {
        return null;
      }

      // Get the ICA router addresses for both chains
      const originRouter = getIcaRouterAddress(originChainName);
      const destRouter = getIcaRouterAddress(destinationChainName);

      if (!originRouter || !destRouter) {
        logger.debug('ICA router not found for chains', originChainName, destinationChainName);
        return null;
      }

      const provider = multiProvider.getEthersV5Provider(destinationChainName);
      const originDomainId = multiProvider.getDomainId(originChainName);

      return computeIcaAddress(
        originDomainId,
        owner,
        originRouter,
        destRouter,
        ism,
        salt,
        provider,
      );
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch the calls from a REVEAL message by parsing the destination transaction.
 */
export function useRevealCalls(
  destinationChainName: string | undefined,
  processTxHash: string | undefined,
  messageId: string | undefined,
  messageType: IcaMessageType | undefined,
) {
  const multiProvider = useReadyMultiProvider();
  const chainMetadataResolver = useChainMetadataResolver();

  return useQuery({
    queryKey: [
      'revealCalls',
      destinationChainName,
      processTxHash,
      messageId,
      messageType,
      !!multiProvider,
    ],
    queryFn: async () => {
      if (
        !destinationChainName ||
        !processTxHash ||
        !messageId ||
        messageType !== IcaMessageType.REVEAL ||
        !multiProvider ||
        !isEVMLike(
          chainMetadataResolver.tryGetProtocol(destinationChainName) ?? ProtocolType.Unknown,
        )
      ) {
        return null;
      }

      return fetchRevealCalls(destinationChainName, processTxHash, messageId, multiProvider);
    },
    retry: false,
    enabled: messageType === IcaMessageType.REVEAL && !!processTxHash && !!messageId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch the CCIP Read ISM address and URLs for REVEAL messages.
 *
 * For REVEAL messages, the CCIP Read ISM is used to verify the commitment.
 * If the ISM in the message is zero address, we fetch the default ISM from the ICA Router.
 * The ISM's urls() function returns the off-chain gateway URLs used to fetch reveal metadata.
 */
export function useCcipReadIsmUrls(
  destinationChainName: string | undefined,
  messageBytes: string | undefined,
  messageType: IcaMessageType | undefined,
) {
  const multiProvider = useReadyMultiProvider();
  const chainMetadataResolver = useChainMetadataResolver();

  return useQuery({
    queryKey: ['ccipReadIsmUrls', destinationChainName, messageBytes, messageType, !!multiProvider],
    queryFn: async () => {
      if (
        !destinationChainName ||
        !messageBytes ||
        messageType !== IcaMessageType.REVEAL ||
        !multiProvider ||
        !isEVMLike(
          chainMetadataResolver.tryGetProtocol(destinationChainName) ?? ProtocolType.Unknown,
        )
      ) {
        return null;
      }

      try {
        const provider = multiProvider.getEthersV5Provider(destinationChainName);

        // Get the ICA Router address for the destination chain
        const icaRouterAddress = getIcaRouterAddress(destinationChainName);
        if (!icaRouterAddress) {
          logger.debug('ICA router not found for chain', destinationChainName);
          return null;
        }

        // Call route(message) on the ICA Router to get the ISM address for this message
        const routerInterface = new utils.Interface([
          'function route(bytes calldata _message) view returns (address)',
        ]);
        const routerContract = new Contract(icaRouterAddress, routerInterface, provider);
        const ismAddress = await routerContract.route(messageBytes);

        if (!ismAddress || ismAddress === '0x0000000000000000000000000000000000000000') {
          return null;
        }

        // Fetch URLs from the CCIP Read ISM
        const ismInterface = new utils.Interface(['function urls() view returns (string[])']);
        const ismContract = new Contract(ismAddress, ismInterface, provider);

        const urls = await ismContract.urls();
        return { ismAddress, urls: urls as string[] };
      } catch (error) {
        logger.debug('Error fetching CCIP Read ISM URLs', error);
        return null;
      }
    },
    retry: false,
    enabled: messageType === IcaMessageType.REVEAL && !!destinationChainName && !!messageBytes,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to find the related ICA message (COMMITMENT <-> REVEAL) by searching
 * for messages in the same origin transaction with matching commitment hash.
 *
 * For commit-reveal flow, both COMMITMENT and REVEAL messages are dispatched
 * in the same transaction via callRemoteCommitReveal().
 */
export function useRelatedIcaMessage(
  originTxHash: string | undefined,
  originDomainId: DomainId | undefined,
  currentMsgId: string | undefined,
  currentCommitment: string | undefined,
  currentMessageType: IcaMessageType | undefined,
) {
  const { scrapedDomains } = useScrapedDomains();
  const chainMetadataResolver = useChainMetadataResolver();
  const multiProvider = useReadyMultiProvider();
  const registry = useRegistry();
  const isPiOrigin =
    originDomainId !== undefined &&
    isPiChain(chainMetadataResolver, scrapedDomains, originDomainId);

  // Only search for related messages if this is a COMMITMENT or REVEAL message
  const shouldSearch =
    !!originTxHash &&
    !!currentMsgId &&
    !!currentCommitment &&
    (currentMessageType === IcaMessageType.COMMITMENT ||
      currentMessageType === IcaMessageType.REVEAL);

  // Build query to fetch all messages from the same origin tx
  // Note: We must always return a valid GraphQL query string (even when paused)
  // because urql may validate the query before checking the pause flag
  const { query, variables } = useMemo(() => {
    if (!shouldSearch || !originTxHash) {
      // Return a valid no-op query that will be paused anyway
      return buildMessageQuery(
        MessageIdentifierType.OriginTxHash,
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        1,
        true,
      );
    }
    return buildMessageQuery(MessageIdentifierType.OriginTxHash, originTxHash, 100, true);
  }, [shouldSearch, originTxHash]);

  // Execute the query
  const [{ data, fetching, error }] = useUrqlQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !shouldSearch || isPiOrigin,
  });

  const {
    data: piMessages,
    isFetching: isPiFetching,
    isError: isPiError,
  } = useQuery({
    queryKey: ['relatedIcaPiMessages', originTxHash, originDomainId, currentMsgId],
    queryFn: async () => {
      if (!originTxHash || originDomainId === undefined || !multiProvider) return [];
      const originMetadata = chainMetadataResolver.tryGetChainMetadata(originDomainId);
      if (!originMetadata) return [];
      return fetchMessagesFromPiChain(
        originMetadata,
        { input: originTxHash },
        multiProvider,
        registry,
        PiQueryType.TxHash,
      );
    },
    enabled: shouldSearch && isPiOrigin && !!multiProvider,
    retry: false,
  });

  // Parse and find the related message
  const relatedMessage = useMemo(() => {
    if (!currentCommitment || !currentMsgId) return null;

    const messages = isPiOrigin
      ? piMessages || []
      : parseMessageStubResult(chainMetadataResolver, scrapedDomains, data);

    // Find the related message by matching commitment hash
    for (const msg of messages) {
      // Skip the current message
      if (msg.msgId === currentMsgId) continue;

      // Decode the message to check if it's the related COMMITMENT/REVEAL
      const decoded = decodeIcaBody(msg.body);
      if (!decoded || !decoded.commitment) continue;

      // Check if the commitment matches
      if (decoded.commitment.toLowerCase() === currentCommitment.toLowerCase()) {
        // Verify it's the opposite type (COMMITMENT <-> REVEAL)
        if (
          (currentMessageType === IcaMessageType.COMMITMENT &&
            decoded.messageType === IcaMessageType.REVEAL) ||
          (currentMessageType === IcaMessageType.REVEAL &&
            decoded.messageType === IcaMessageType.COMMITMENT)
        ) {
          return {
            message: msg,
            messageType: decoded.messageType,
            decoded,
          };
        }
      }
    }

    return null;
  }, [
    data,
    piMessages,
    isPiOrigin,
    chainMetadataResolver,
    scrapedDomains,
    currentMsgId,
    currentCommitment,
    currentMessageType,
  ]);

  return {
    relatedMessage: relatedMessage?.message,
    relatedMessageType: relatedMessage?.messageType,
    relatedDecoded: relatedMessage?.decoded,
    isFetching: isPiOrigin ? isPiFetching : fetching,
    isError: isPiOrigin ? isPiError : !!error,
  };
}
