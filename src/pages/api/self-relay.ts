import { GithubRegistry } from '@hyperlane-xyz/registry';
import { HookType, HyperlaneCore, MultiProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import type { NextApiRequest, NextApiResponse } from 'next';

import { config } from '../../consts/config';
import {
  BoundedEvmIsmReader,
  isSelfRelayIsmRejection,
} from '../../features/selfRelay/boundedIsmReader';
import { findMailboxDispatchedMessage } from '../../features/selfRelay/dispatch';
import {
  InFlightLimit,
  SelfRelayPreparationTimeoutError,
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

  const preparation = preparationLimit.run(() => prepareSelfRelay(parsedRequest.data));
  if (!preparation) {
    return res.status(429).json({ status: 'error', error: 'Self-relay service is busy' });
  }

  try {
    const result = await withDeadline(preparation, PREPARATION_TIMEOUT_MS);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    if (isSelfRelayIsmRejection(error)) {
      const isOffchainLookup = error instanceof Error && error.message.includes('OffchainLookup');
      return res.status(422).json({
        status: 'error',
        error: isOffchainLookup
          ? 'OffchainLookup security modules are not supported for self-relay'
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

async function prepareSelfRelay(request: SelfRelayPrepareRequest): Promise<ApiResult> {
  const { coreAddresses, multiProvider, core, getMetadataBuilder } = await getRelayContext();
  const { messageId, originDomainId, originTxHash } = request;
  const originChainName = multiProvider.tryGetChainName(originDomainId);

  if (!originChainName) {
    return errorResult(404, 'Origin chain not found');
  }

  const originMetadata = multiProvider.getChainMetadata(originChainName);
  if (originMetadata.protocol !== ProtocolType.Ethereum) {
    return errorResult(422, 'Self-relay supports EVM only');
  }

  const originAddresses = coreAddresses[originChainName];
  if (!originAddresses?.mailbox) {
    return errorResult(422, 'Origin Mailbox is not configured');
  }

  const dispatchReceipt = await multiProvider
    .getProvider(originChainName)
    .getTransactionReceipt(originTxHash);
  if (!dispatchReceipt) {
    return errorResult(404, 'Dispatch transaction not found');
  }

  const message = findMailboxDispatchedMessage(dispatchReceipt, originAddresses.mailbox, messageId);
  if (!message || message.parsed.origin !== originDomainId) {
    return errorResult(404, 'Message not found in dispatch');
  }

  const destinationChainName = multiProvider.tryGetChainName(message.parsed.destination);
  if (!destinationChainName) {
    return errorResult(404, 'Destination chain not found');
  }

  const destinationMetadata = multiProvider.getChainMetadata(destinationChainName);
  if (destinationMetadata.protocol !== ProtocolType.Ethereum) {
    return errorResult(422, 'Self-relay supports EVM only');
  }

  if (await core.isDelivered(message)) {
    return { statusCode: 200, body: { status: 'delivered' } };
  }

  const merkleTreeHook = originAddresses.merkleTreeHook;
  if (!merkleTreeHook) {
    return errorResult(422, 'Origin Merkle tree hook is not configured');
  }

  const ismAddress = await core.getRecipientIsmAddress(message);
  const ism = await new BoundedEvmIsmReader(multiProvider, destinationChainName, message, {
    maxDepth: 10,
    maxFanout: 16,
    maxModules: 64,
    deadline: Date.now() + PREPARATION_TIMEOUT_MS - 1_000,
  }).deriveIsmConfig(ismAddress);
  // Match the CLI self-relay workaround: the canonical Merkle tree hook is
  // the source of the checkpoint used to build validator metadata.
  const hook = { type: HookType.MERKLE_TREE, address: merkleTreeHook };
  const { builder, isMetadataBuildable } = await getMetadataBuilder();
  const metadataResult = await builder.build({
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
  await multiProvider.getProvider(destinationChainName).estimateGas({
    to: mailbox.address,
    data: calldata,
  });

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
  const core = HyperlaneCore.fromAddressesMap(coreAddresses, multiProvider);
  let metadataBuilderPromise: ReturnType<typeof createMetadataBuilder> | undefined;

  return {
    coreAddresses,
    multiProvider,
    core,
    getMetadataBuilder() {
      metadataBuilderPromise ??= createMetadataBuilder(core);
      return metadataBuilderPromise;
    },
  };
}

async function createMetadataBuilder(core: HyperlaneCore) {
  const { BaseMetadataBuilder, isMetadataBuildable } =
    await import('@hyperlane-xyz/relayer/metadata');
  return { builder: new BaseMetadataBuilder(core), isMetadataBuildable };
}
