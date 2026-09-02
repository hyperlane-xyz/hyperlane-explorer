import { GithubRegistry } from '@hyperlane-xyz/registry';
import { HookType, HyperlaneCore, MultiProvider, type ChainMap } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import type { providers } from 'ethers';
import type { NextApiRequest, NextApiResponse } from 'next';

import { config } from '../../consts/config';
import { wrapWithAbort } from '../../features/messages/queries/abortableProvider';
import {
  BoundedEvmIsmReader,
  assertSelfRelayIsmSupported,
  isSelfRelayIsmRejection,
  isUnsupportedSelfRelayIsm,
} from '../../features/selfRelay/boundedIsmReader';
import { findMailboxDispatchedMessage } from '../../features/selfRelay/dispatch';
import {
  InFlightLimit,
  SelfRelayPreparationTimeoutError,
  abortable,
  withDeadline,
} from '../../features/selfRelay/serverLimits';
import { withServerRpcConnections } from '../../features/selfRelay/serverRpc';
import {
  SelfRelayPrepareRequestSchema,
  SelfRelayPrepareResponseSchema,
  type SelfRelayPrepareRequest,
  type SelfRelayPrepareResponse,
} from '../../features/selfRelay/types';
import { logger } from '../../utils/logger';

const PREPARATION_TIMEOUT_MS = 25_000;
const RELAY_CONTEXT_TTL_MS = 5 * 60_000;
// Bounds one warm server instance; deployment-level rate limiting remains separate.
const preparationLimit = new InFlightLimit(2);

interface ApiResult {
  statusCode: number;
  body: SelfRelayPrepareResponse;
}

function errorResult(statusCode: number, error: string): ApiResult {
  return { statusCode, body: { status: 'error', error } };
}

let relayContextCache:
  | { expiresAt: number; promise: ReturnType<typeof createRelayContext> }
  | undefined;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SelfRelayPrepareResponse>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', error: 'Method not allowed' });
  }

  const parsedRequest = SelfRelayPrepareRequestSchema.safeParse(req.body);
  if (!parsedRequest.success) {
    return res.status(400).json({ status: 'error', error: 'Invalid self-relay request' });
  }

  const preparation = preparationLimit.run(() =>
    withDeadline((signal) => prepareSelfRelay(parsedRequest.data, signal), PREPARATION_TIMEOUT_MS),
  );
  if (!preparation) {
    return res.status(429).json({ status: 'error', error: 'Self-relay service is busy' });
  }

  try {
    const result = await preparation;
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    if (isSelfRelayIsmRejection(error)) {
      const isOffchainLookup = error instanceof Error && error.message.includes('OffchainLookup');
      return res.status(422).json({
        status: 'error',
        error: isOffchainLookup
          ? 'OffchainLookup security modules are not supported for self-relay'
          : isUnsupportedSelfRelayIsm(error)
            ? 'Destination security module is not supported for self-relay'
            : 'Destination security configuration exceeds self-relay safety limits',
      });
    }
    if (error instanceof SelfRelayPreparationTimeoutError) {
      return res.status(503).json({ status: 'error', error: error.message });
    }

    logger.error('Unable to prepare self-relay transaction', error);
    return res.status(500).json({
      status: 'error',
      error: 'Unable to prepare relay transaction',
    });
  }
}

async function prepareSelfRelay(
  request: SelfRelayPrepareRequest,
  signal: AbortSignal,
): Promise<ApiResult> {
  const {
    chainMetadata,
    coreAddresses,
    multiProvider: baseMultiProvider,
    getMetadataModule,
  } = await abortable(getRelayContext(), signal);
  const { messageId, originDomainId, originTxHash } = request;
  const originChainName = baseMultiProvider.tryGetChainName(originDomainId);

  if (!originChainName) {
    return errorResult(404, 'Origin chain not found');
  }

  const originMetadata = baseMultiProvider.getChainMetadata(originChainName);
  if (originMetadata.protocol !== ProtocolType.Ethereum) {
    return errorResult(422, 'Self-relay supports EVM only');
  }

  const originAddresses = coreAddresses[originChainName];
  if (!originAddresses?.mailbox) {
    return errorResult(422, 'Origin Mailbox is not configured');
  }

  const originProvider = wrapWithAbort(baseMultiProvider.getProvider(originChainName), signal);
  const dispatchReceipt = await abortable<providers.TransactionReceipt | null>(
    originProvider.getTransactionReceipt(originTxHash),
    signal,
  );
  if (!dispatchReceipt) {
    return errorResult(404, 'Dispatch transaction not found');
  }

  const message = findMailboxDispatchedMessage(dispatchReceipt, originAddresses.mailbox, messageId);
  if (!message || message.parsed.origin !== originDomainId) {
    return errorResult(404, 'Message not found in dispatch');
  }

  const destinationChainName = baseMultiProvider.tryGetChainName(message.parsed.destination);
  if (!destinationChainName) {
    return errorResult(404, 'Destination chain not found');
  }

  const destinationMetadata = baseMultiProvider.getChainMetadata(destinationChainName);
  if (destinationMetadata.protocol !== ProtocolType.Ethereum) {
    return errorResult(422, 'Self-relay supports EVM only');
  }

  const requestProviders: ChainMap<providers.Provider> = {
    [originChainName]: originProvider,
    [destinationChainName]: wrapWithAbort(
      baseMultiProvider.getProvider(destinationChainName),
      signal,
    ),
  };
  const multiProvider = new MultiProvider(chainMetadata, { providers: requestProviders });
  const core = HyperlaneCore.fromAddressesMap(coreAddresses, multiProvider);

  if (await abortable(core.isDelivered(message), signal)) {
    return { statusCode: 200, body: { status: 'delivered' } };
  }

  const merkleTreeHook = originAddresses.merkleTreeHook;
  if (!merkleTreeHook) {
    return errorResult(422, 'Origin Merkle tree hook is not configured');
  }

  const ismAddress = await abortable(core.getRecipientIsmAddress(message), signal);
  const ism = await abortable(
    new BoundedEvmIsmReader(multiProvider, destinationChainName, message, {
      maxDepth: 10,
      maxFanout: 16,
      maxModules: 64,
      maxValidators: 16,
      deadline: Date.now() + PREPARATION_TIMEOUT_MS - 1_000,
    }).deriveIsmConfig(ismAddress),
    signal,
  );
  assertSelfRelayIsmSupported(ism);
  // Match the CLI self-relay workaround: the canonical Merkle tree hook is
  // the source of the checkpoint used to build validator metadata.
  const hook = { type: HookType.MERKLE_TREE, address: merkleTreeHook };
  const { SelfRelayMetadataBuilder, isMetadataBuildable } = await abortable(
    getMetadataModule(),
    signal,
  );
  const metadataResult = await new SelfRelayMetadataBuilder(core, signal).build({
    message,
    ism,
    hook,
    dispatchTx: dispatchReceipt,
  });

  if (!isMetadataBuildable(metadataResult)) {
    return errorResult(
      409,
      'Security metadata is not ready yet. Validator signatures may still be pending.',
    );
  }

  const mailbox = core.getContracts(destinationChainName).mailbox;
  const calldata = mailbox.interface.encodeFunctionData('process', [
    metadataResult.metadata,
    message.message,
  ]);
  await abortable(
    multiProvider.getProvider(destinationChainName).estimateGas({
      to: mailbox.address,
      data: calldata,
    }),
    signal,
  );

  return {
    statusCode: 200,
    body: SelfRelayPrepareResponseSchema.parse({
      status: 'ready',
      destinationChainId: destinationMetadata.chainId,
      destinationChainName,
      mailboxAddress: mailbox.address,
      calldata,
    }),
  };
}

async function getRelayContext() {
  if (!relayContextCache || relayContextCache.expiresAt <= Date.now()) {
    relayContextCache = {
      expiresAt: Date.now() + RELAY_CONTEXT_TTL_MS,
      promise: createRelayContext(),
    };
  }

  const cacheEntry = relayContextCache;
  try {
    return await cacheEntry.promise;
  } catch (error) {
    if (relayContextCache === cacheEntry) relayContextCache = undefined;
    throw error;
  }
}

async function createRelayContext() {
  const registry = new GithubRegistry({
    proxyUrl: config.githubProxy,
    uri: config.registryUrl,
    branch: config.registryBranch,
  });
  const [chainMetadata, coreAddresses] = await Promise.all([
    registry.getMetadata(),
    registry.getAddresses(),
  ]);
  const multiProvider = new MultiProvider(withServerRpcConnections(chainMetadata));
  let metadataModulePromise: ReturnType<typeof loadMetadataModule> | undefined;

  return {
    chainMetadata,
    coreAddresses,
    multiProvider,
    getMetadataModule() {
      metadataModulePromise ??= loadMetadataModule();
      return metadataModulePromise;
    },
  };
}

function loadMetadataModule() {
  return import('../../features/selfRelay/serverMetadata');
}
