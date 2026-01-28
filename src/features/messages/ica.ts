import { chainAddresses } from '@hyperlane-xyz/registry';
import { bytes32ToAddress, strip0x } from '@hyperlane-xyz/utils';
import { useQuery } from '@tanstack/react-query';
import { BigNumber, Contract, utils } from 'ethers';
import { useMemo } from 'react';
import { useQuery as useUrqlQuery } from 'urql';

import { useMultiProvider, useReadyMultiProvider } from '../../store';
import { IcaCall, IcaRouterAddressMap, Message, MessageStub } from '../../types';
import { logger } from '../../utils/logger';
import { useScrapedDomains } from '../chains/queries/useScrapedChains';
import { MessageIdentifierType, buildMessageQuery } from './queries/build';
import { MessagesStubQueryResult } from './queries/fragments';
import { parseMessageStubResult } from './queries/parse';

/**
 * ICA Message Types (from InterchainAccountMessage.sol)
 */
export enum IcaMessageType {
  CALLS = 0,
  COMMITMENT = 1,
  REVEAL = 2,
}

/**
 * Decoded ICA message with all fields
 */
export interface DecodedIcaMessage {
  messageType: IcaMessageType;
  owner: string; // bytes32 -> address
  ism: string; // bytes32 -> address
  salt: string; // bytes32 hex
  calls: IcaCall[]; // Only present for CALLS type
  commitment?: string; // Only present for COMMITMENT type
}

// Build a map of chainName -> ICA router address from the registry
export function buildIcaRouterAddressMap(): IcaRouterAddressMap {
  const map: IcaRouterAddressMap = {};

  for (const [chainName, addresses] of Object.entries(chainAddresses)) {
    const icaRouter = (addresses as Record<string, string>).interchainAccountRouter;
    if (icaRouter) {
      map[chainName] = icaRouter;
    }
  }

  return map;
}

// Cached ICA router address map built at module load time
const ICA_ROUTER_MAP = buildIcaRouterAddressMap();

// Get all known ICA router addresses as a Set for fast lookup
function getIcaRouterAddresses(): Set<string> {
  return new Set(Object.values(ICA_ROUTER_MAP).map((addr) => addr.toLowerCase()));
}

/**
 * Check if an address is a known ICA router
 */
export function isAddressIcaRouter(addr: Address): boolean {
  if (!addr) return false;
  try {
    const icaRouters = getIcaRouterAddresses();
    return icaRouters.has(addr.toLowerCase());
  } catch (error) {
    logger.warn('Error checking if address is ICA router', error, addr);
    return false;
  }
}

/**
 * Check if a message is an ICA message by verifying both sender and recipient
 * are known ICA router addresses
 */
export function isIcaMessage({
  sender,
  recipient,
}: {
  sender: Address;
  recipient: Address;
}): boolean {
  const isSenderIca = isAddressIcaRouter(sender);
  const isRecipIca = isAddressIcaRouter(recipient);

  if (isSenderIca && isRecipIca) return true;

  if (isSenderIca && !isRecipIca) {
    logger.warn('Msg sender is ICA router but not recipient', sender, recipient);
  }
  if (!isSenderIca && isRecipIca) {
    logger.warn('Msg recipient is ICA router but not sender', recipient, sender);
  }

  return false;
}

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
 * Decode an ICA message body.
 *
 * Message formats (from InterchainAccountMessage.sol):
 *
 * CALLS message:
 * - Byte 0: MessageType.CALLS (0x00)
 * - Bytes 1-33: ICA owner (bytes32)
 * - Bytes 33-65: ICA ISM (bytes32)
 * - Bytes 65-97: User Salt (bytes32)
 * - Bytes 97+: ABI-encoded Call[] where Call = (bytes32 to, uint256 value, bytes data)
 *
 * COMMITMENT message:
 * - Byte 0: MessageType.COMMITMENT (0x01)
 * - Bytes 1-33: ICA owner (bytes32)
 * - Bytes 33-65: ICA ISM (bytes32)
 * - Bytes 65-97: User Salt (bytes32)
 * - Bytes 97-129: Commitment (bytes32)
 *
 * REVEAL message:
 * - Byte 0: MessageType.REVEAL (0x02)
 * - Bytes 1-33: ICA ISM (bytes32)
 * - Bytes 33-65: Commitment (bytes32)
 */
export function decodeIcaBody(body: string): DecodedIcaMessage | null {
  if (!body || BigNumber.from(body).isZero()) return null;

  try {
    const bodyHex = strip0x(body);

    // Minimum length to read message type: 1 byte = 2 hex chars
    if (bodyHex.length < 2) {
      logger.warn('ICA body too short to read message type');
      return null;
    }

    // Parse message type (first byte)
    const messageType = parseInt(bodyHex.slice(0, 2), 16) as IcaMessageType;

    if (messageType === IcaMessageType.REVEAL) {
      // REVEAL format: type (1) + ism (32) + commitment (32) = 65 bytes = 130 hex chars
      if (bodyHex.length < 130) {
        logger.warn('REVEAL message body too short');
        return null;
      }

      const revealIsm = bytes32ToAddress('0x' + bodyHex.slice(2, 66));
      const revealCommitment = '0x' + bodyHex.slice(66, 130);

      return {
        messageType,
        owner: '', // Not present in REVEAL
        ism: revealIsm,
        salt: '', // Not present in REVEAL
        calls: [],
        commitment: revealCommitment,
      };
    }

    // CALLS and COMMITMENT messages have the same prefix format
    // Minimum length: 1 byte type + 32 bytes owner + 32 bytes ism + 32 bytes salt = 97 bytes = 194 hex chars
    if (bodyHex.length < 194) {
      logger.warn('ICA CALLS/COMMITMENT body too short');
      return null;
    }

    // Parse owner (bytes 1-33)
    const ownerBytes32 = '0x' + bodyHex.slice(2, 66);
    const owner = bytes32ToAddress(ownerBytes32);

    // Parse ISM (bytes 33-65)
    const ismBytes32 = '0x' + bodyHex.slice(66, 130);
    const ism = bytes32ToAddress(ismBytes32);

    // Parse salt (bytes 65-97)
    const salt = '0x' + bodyHex.slice(130, 194);

    if (messageType === IcaMessageType.CALLS) {
      // Decode the ABI-encoded calls array (bytes 97+)
      const encodedCalls = '0x' + bodyHex.slice(194);

      // Format: (bytes32 to, uint256 value, bytes data)[]
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(bytes32 to, uint256 value, bytes data)[]'],
        encodedCalls,
      );

      const rawCalls = decoded[0] as Array<{
        to: string;
        value: BigNumber;
        data: string;
      }>;

      const calls: IcaCall[] = rawCalls.map((call) => ({
        to: bytes32ToAddress(call.to),
        value: call.value.toString(),
        data: call.data,
      }));

      return { messageType, owner, ism, salt, calls };
    } else if (messageType === IcaMessageType.COMMITMENT) {
      // Commitment is bytes 97-129
      if (bodyHex.length < 258) {
        logger.warn('COMMITMENT message body too short for commitment hash');
        return null;
      }
      const commitment = '0x' + bodyHex.slice(194, 258);
      return { messageType, owner, ism, salt, calls: [], commitment };
    }

    // Unknown message type
    logger.warn('Unknown ICA message type:', messageType);
    return null;
  } catch (error) {
    logger.error('Error decoding ICA body', error);
    return null;
  }
}

/**
 * Parse ICA message details from a message
 */
export function parseIcaMessageDetails(message: Message | MessageStub): DecodedIcaMessage | null {
  const { body, sender, recipient } = message;

  // First verify this is an ICA message
  if (!isIcaMessage({ sender, recipient })) {
    return null;
  }

  if (!body) return null;

  return decodeIcaBody(body);
}

/**
 * Get the ICA router address for a given chain
 */
export function getIcaRouterAddress(chainName: string): Address | undefined {
  return ICA_ROUTER_MAP[chainName];
}

/**
 * Decode the ISM metadata for a REVEAL message to extract the calls.
 *
 * Metadata format (from CommitmentReadIsm.verify):
 * - Bytes 0-20: ICA address
 * - Bytes 20-52: Salt (bytes32)
 * - Bytes 52+: ABI-encoded CallLib.Call[]
 */
export function decodeRevealMetadata(metadata: string): {
  icaAddress: string;
  salt: string;
  calls: IcaCall[];
} | null {
  try {
    const metaHex = strip0x(metadata);

    // Minimum: 20 bytes address + 32 bytes salt = 52 bytes = 104 hex chars
    if (metaHex.length < 104) {
      return null;
    }

    // ICA address (bytes 0-20)
    const icaAddress = '0x' + metaHex.slice(0, 40);

    // Salt (bytes 20-52)
    const salt = '0x' + metaHex.slice(40, 104);

    // Calls (bytes 52+)
    const encodedCalls = '0x' + metaHex.slice(104);

    const decoded = utils.defaultAbiCoder.decode(
      ['tuple(bytes32 to, uint256 value, bytes data)[]'],
      encodedCalls,
    );

    const rawCalls = decoded[0] as Array<{
      to: string;
      value: BigNumber;
      data: string;
    }>;

    const calls: IcaCall[] = rawCalls.map((call) => ({
      to: bytes32ToAddress(call.to),
      value: call.value.toString(),
      data: call.data,
    }));

    return { icaAddress, salt, calls };
  } catch (error) {
    logger.error('Error decoding reveal metadata', error);
    return null;
  }
}

// Multicall3 canonical address (deployed on 70+ chains at the same address)
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// Common Multicall3 function signatures
const MULTICALL_SIGNATURES = {
  // aggregate3: (Call3[] calldata calls) -> (Result[] memory returnData)
  // where Call3 = { target, allowFailure, callData }
  aggregate3: 'aggregate3((address,bool,bytes)[])',
  // aggregate3Value: (Call3Value[] calldata calls) -> (Result[] memory returnData)
  // where Call3Value = { target, allowFailure, value, callData }
  aggregate3Value: 'aggregate3Value((address,bool,uint256,bytes)[])',
  // tryAggregate: (bool requireSuccess, Call[] calldata calls) -> (Result[] memory returnData)
  tryAggregate: 'tryAggregate(bool,(address,bytes)[])',
  // aggregate: (Call[] calldata calls) -> (uint256 blockNumber, bytes[] memory returnData)
  aggregate: 'aggregate((address,bytes)[])',
};

/**
 * Get the mailbox address for a chain from the registry
 */
function getMailboxAddress(chainName: string): Address | undefined {
  const addresses = chainAddresses[chainName as keyof typeof chainAddresses];
  return (addresses as Record<string, string> | undefined)?.mailbox;
}

/**
 * Get the batch contract address for a chain from the registry (if available)
 */
function getBatchContractAddress(chainName: string): Address | undefined {
  const addresses = chainAddresses[chainName as keyof typeof chainAddresses];
  return (addresses as Record<string, string> | undefined)?.batchContractAddress;
}

/**
 * Check if an address is a known multicall/batch contract
 */
function isMulticallAddress(address: Address, chainName: string): boolean {
  const normalizedAddress = address.toLowerCase();

  // Check canonical Multicall3 address
  if (normalizedAddress === MULTICALL3_ADDRESS.toLowerCase()) {
    return true;
  }

  // Check chain-specific batch contract address from registry
  const batchContract = getBatchContractAddress(chainName);
  if (batchContract && normalizedAddress === batchContract.toLowerCase()) {
    return true;
  }

  return false;
}

/**
 * Try to extract process calls from a multicall transaction.
 * Supports various Multicall contract formats (Multicall3, etc.)
 */
function tryDecodeMulticall(
  txData: string,
  mailboxInterface: utils.Interface,
): Array<{ metadata: string; message: string }> {
  const results: Array<{ metadata: string; message: string }> = [];

  try {
    const selector = txData.slice(0, 10);

    // Try aggregate3: (Call3[] calldata calls)
    // Call3 = (address target, bool allowFailure, bytes callData)
    if (selector === utils.id(MULTICALL_SIGNATURES.aggregate3).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(address target, bool allowFailure, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[0] as Array<{
        target: string;
        allowFailure: boolean;
        callData: string;
      }>;

      for (const call of calls) {
        try {
          const parsed = mailboxInterface.parseTransaction({ data: call.callData });
          if (parsed.name === 'process') {
            results.push({
              metadata: parsed.args[0] as string,
              message: parsed.args[1] as string,
            });
          }
        } catch {
          // Not a process call, continue
        }
      }
      return results;
    }

    // Try aggregate3Value: (Call3Value[] calldata calls)
    // Call3Value = (address target, bool allowFailure, uint256 value, bytes callData)
    if (selector === utils.id(MULTICALL_SIGNATURES.aggregate3Value).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(address target, bool allowFailure, uint256 value, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[0] as Array<{
        target: string;
        allowFailure: boolean;
        value: BigNumber;
        callData: string;
      }>;

      for (const call of calls) {
        try {
          const parsed = mailboxInterface.parseTransaction({ data: call.callData });
          if (parsed.name === 'process') {
            results.push({
              metadata: parsed.args[0] as string,
              message: parsed.args[1] as string,
            });
          }
        } catch {
          // Not a process call, continue
        }
      }
      return results;
    }

    // Try tryAggregate: (bool requireSuccess, Call[] calldata calls)
    // Call = (address target, bytes callData)
    if (selector === utils.id(MULTICALL_SIGNATURES.tryAggregate).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['bool', 'tuple(address target, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[1] as Array<{ target: string; callData: string }>;

      for (const call of calls) {
        try {
          const parsed = mailboxInterface.parseTransaction({ data: call.callData });
          if (parsed.name === 'process') {
            results.push({
              metadata: parsed.args[0] as string,
              message: parsed.args[1] as string,
            });
          }
        } catch {
          // Not a process call, continue
        }
      }
      return results;
    }

    // Try aggregate: (Call[] calldata calls)
    // Call = (address target, bytes callData)
    if (selector === utils.id(MULTICALL_SIGNATURES.aggregate).slice(0, 10)) {
      const decoded = utils.defaultAbiCoder.decode(
        ['tuple(address target, bytes callData)[]'],
        '0x' + txData.slice(10),
      );
      const calls = decoded[0] as Array<{ target: string; callData: string }>;

      for (const call of calls) {
        try {
          const parsed = mailboxInterface.parseTransaction({ data: call.callData });
          if (parsed.name === 'process') {
            results.push({
              metadata: parsed.args[0] as string,
              message: parsed.args[1] as string,
            });
          }
        } catch {
          // Not a process call, continue
        }
      }
      return results;
    }
  } catch (error) {
    logger.debug('Failed to decode multicall', error);
  }

  return results;
}

/**
 * Fetch the calls for a REVEAL message by parsing the process transaction.
 * The calls are passed as ISM metadata to the mailbox.process() function.
 * Handles both direct process calls to the mailbox and multicall batches.
 */
export async function fetchRevealCalls(
  destinationChainName: string,
  processTxHash: string,
  messageId: string,
  multiProvider: any,
): Promise<IcaCall[] | null> {
  try {
    const provider = multiProvider.getEthersV5Provider(destinationChainName);
    const tx = await provider.getTransaction(processTxHash);

    if (!tx || !tx.data || !tx.to) {
      logger.debug('Transaction not found or has no data/to address');
      return null;
    }

    // eslint-disable-next-line camelcase
    const { Mailbox__factory } = await import('@hyperlane-xyz/core');
    // eslint-disable-next-line camelcase
    const mailboxInterface = Mailbox__factory.createInterface();

    const mailboxAddress = getMailboxAddress(destinationChainName);
    const txTo = tx.to.toLowerCase();

    // Check if this is a direct call to the mailbox
    if (mailboxAddress && txTo === mailboxAddress.toLowerCase()) {
      logger.debug('Direct process call to mailbox detected');
      try {
        const decoded = mailboxInterface.parseTransaction({ data: tx.data });

        if (decoded.name === 'process') {
          const metadata = decoded.args[0] as string;
          const revealData = decodeRevealMetadata(metadata);

          if (revealData) {
            return revealData.calls;
          }
        }
      } catch {
        logger.debug('Failed to decode direct process call');
      }
      return null;
    }

    // Check if this is a multicall transaction
    if (isMulticallAddress(tx.to, destinationChainName)) {
      logger.debug('Multicall transaction detected');
      const processCalls = tryDecodeMulticall(tx.data, mailboxInterface);

      if (processCalls.length > 0) {
        // Find the process call that matches our message ID
        const { messageId: computeMessageId } = await import('@hyperlane-xyz/utils');

        for (const processCall of processCalls) {
          try {
            const msgId = computeMessageId(processCall.message);
            if (msgId.toLowerCase() === messageId.toLowerCase()) {
              const revealData = decodeRevealMetadata(processCall.metadata);
              if (revealData) {
                return revealData.calls;
              }
            }
          } catch {
            // Failed to compute message ID, continue
          }
        }

        // If we couldn't match by message ID, return the first one (fallback)
        logger.debug('Could not match message ID, using first process call');
        const revealData = decodeRevealMetadata(processCalls[0].metadata);
        if (revealData) {
          return revealData.calls;
        }
      }
      return null;
    }

    // Unknown destination contract - try both approaches as fallback
    logger.debug('Unknown destination contract, trying fallback decoding');

    // Try direct process call first
    try {
      const decoded = mailboxInterface.parseTransaction({ data: tx.data });
      if (decoded.name === 'process') {
        const metadata = decoded.args[0] as string;
        const revealData = decodeRevealMetadata(metadata);
        if (revealData) {
          return revealData.calls;
        }
      }
    } catch {
      // Not a direct process call
    }

    // Try multicall decode
    const processCalls = tryDecodeMulticall(tx.data, mailboxInterface);
    if (processCalls.length > 0) {
      const { messageId: computeMessageId } = await import('@hyperlane-xyz/utils');

      for (const processCall of processCalls) {
        try {
          const msgId = computeMessageId(processCall.message);
          if (msgId.toLowerCase() === messageId.toLowerCase()) {
            const revealData = decodeRevealMetadata(processCall.metadata);
            if (revealData) {
              return revealData.calls;
            }
          }
        } catch {
          // Failed to compute message ID, continue
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Error fetching reveal calls', error);
    return null;
  }
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
      if (!originChainName || !destinationChainName || !owner || !multiProvider) {
        return null;
      }

      try {
        // Get the ICA router addresses for both chains
        const originRouter = getIcaRouterAddress(originChainName);
        const destRouter = getIcaRouterAddress(destinationChainName);

        if (!originRouter || !destRouter) {
          logger.debug('ICA router not found for chains', originChainName, destinationChainName);
          return null;
        }

        // Use the contract directly to get the ICA address
        // eslint-disable-next-line camelcase
        const { InterchainAccountRouter__factory } = await import('@hyperlane-xyz/core');
        const provider = multiProvider.getEthersV5Provider(destinationChainName);
        // eslint-disable-next-line camelcase
        const router = InterchainAccountRouter__factory.connect(destRouter, provider);

        const originDomainId = multiProvider.getDomainId(originChainName);

        // Use zero address for ISM if not specified (will use default ISM)
        const ismAddress = ism || '0x0000000000000000000000000000000000000000';

        // Use the 5-parameter version that includes salt
        const userSalt = salt || '0x' + '0'.repeat(64);

        // Get the ICA address using the contract with salt
        // Signature: getLocalInterchainAccount(uint32,bytes32,bytes32,address,bytes32)
        const { addressToBytes32 } = await import('@hyperlane-xyz/utils');
        const icaAddress = await router[
          'getLocalInterchainAccount(uint32,bytes32,bytes32,address,bytes32)'
        ](
          originDomainId,
          addressToBytes32(owner),
          addressToBytes32(originRouter),
          ismAddress,
          userSalt,
        );

        return icaAddress;
      } catch (error) {
        logger.error('Error fetching ICA address', error);
        return null;
      }
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
        !multiProvider
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

  return useQuery({
    queryKey: ['ccipReadIsmUrls', destinationChainName, messageBytes, messageType, !!multiProvider],
    queryFn: async () => {
      if (
        !destinationChainName ||
        !messageBytes ||
        messageType !== IcaMessageType.REVEAL ||
        !multiProvider
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
  currentMsgId: string | undefined,
  currentCommitment: string | undefined,
  currentMessageType: IcaMessageType | undefined,
) {
  const { scrapedDomains } = useScrapedDomains();
  const multiProvider = useMultiProvider();

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
    return buildMessageQuery(MessageIdentifierType.OriginTxHash, originTxHash, 10, true);
  }, [shouldSearch, originTxHash]);

  // Execute the query
  const [{ data, fetching, error }] = useUrqlQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !shouldSearch,
  });

  // Parse and find the related message
  const relatedMessage = useMemo(() => {
    if (!data || !currentCommitment || !currentMsgId) return null;

    const messages = parseMessageStubResult(multiProvider, scrapedDomains, data);

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
  }, [data, multiProvider, scrapedDomains, currentMsgId, currentCommitment, currentMessageType]);

  return {
    relatedMessage: relatedMessage?.message,
    relatedMessageType: relatedMessage?.messageType,
    relatedDecoded: relatedMessage?.decoded,
    isFetching: fetching,
    isError: !!error,
  };
}
