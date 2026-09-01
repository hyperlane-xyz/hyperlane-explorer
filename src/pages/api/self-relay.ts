import { GithubRegistry } from '@hyperlane-xyz/registry';
import { EvmIsmReader, HookType, HyperlaneCore, MultiProvider } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import type { NextApiRequest, NextApiResponse } from 'next';

import { config } from '../../consts/config';
import { withServerRpcConnections } from '../../features/selfRelay/serverRpc';
import {
  SelfRelayPrepareRequestSchema,
  SelfRelayPrepareResponseSchema,
  type SelfRelayPrepareResponse,
} from '../../features/selfRelay/types';
import { logger } from '../../utils/logger';

let relayContextPromise: ReturnType<typeof createRelayContext> | undefined;

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

  try {
    const { coreAddresses, multiProvider, core } = await getRelayContext();
    const { messageId, originDomainId, originTxHash } = parsedRequest.data;
    const originChainName = multiProvider.tryGetChainName(originDomainId);

    if (!originChainName) {
      return res.status(404).json({ status: 'error', error: 'Origin chain not found' });
    }

    const originMetadata = multiProvider.getChainMetadata(originChainName);
    if (originMetadata.protocol !== ProtocolType.Ethereum) {
      return res.status(422).json({ status: 'error', error: 'Self-relay supports EVM only' });
    }

    const dispatchReceipt = await multiProvider
      .getProvider(originChainName)
      .getTransactionReceipt(originTxHash);
    if (!dispatchReceipt) {
      return res.status(404).json({ status: 'error', error: 'Dispatch transaction not found' });
    }

    const message = HyperlaneCore.getDispatchedMessages(dispatchReceipt).find(
      (candidate) => candidate.id.toLowerCase() === messageId.toLowerCase(),
    );
    if (!message || message.parsed.origin !== originDomainId) {
      return res.status(404).json({ status: 'error', error: 'Message not found in dispatch' });
    }

    const destinationChainName = multiProvider.tryGetChainName(message.parsed.destination);
    if (!destinationChainName) {
      return res.status(404).json({ status: 'error', error: 'Destination chain not found' });
    }

    const destinationMetadata = multiProvider.getChainMetadata(destinationChainName);
    if (destinationMetadata.protocol !== ProtocolType.Ethereum) {
      return res.status(422).json({ status: 'error', error: 'Self-relay supports EVM only' });
    }

    if (await core.isDelivered(message)) {
      return res.status(200).json({ status: 'delivered' });
    }

    const merkleTreeHook = coreAddresses[originChainName]?.merkleTreeHook;
    if (!merkleTreeHook) {
      return res.status(422).json({
        status: 'error',
        error: 'Origin Merkle tree hook is not configured',
      });
    }

    const ismAddress = await core.getRecipientIsmAddress(message);
    const ism = await new EvmIsmReader(
      multiProvider,
      destinationChainName,
      undefined,
      message,
    ).deriveIsmConfig(ismAddress);
    // Match the CLI self-relay workaround: the canonical Merkle tree hook is
    // the source of the checkpoint used to build validator metadata.
    const hook = { type: HookType.MERKLE_TREE, address: merkleTreeHook };
    const { BaseMetadataBuilder, isMetadataBuildable } =
      await import('@hyperlane-xyz/relayer/metadata');
    const metadataResult = await new BaseMetadataBuilder(core).build({
      message,
      ism,
      hook,
      dispatchTx: dispatchReceipt,
    });

    if (!isMetadataBuildable(metadataResult)) {
      return res.status(409).json({
        status: 'error',
        error: 'Security metadata is not ready yet. Validator signatures may still be pending.',
      });
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

    return res.status(200).json(
      SelfRelayPrepareResponseSchema.parse({
        status: 'ready',
        destinationChainId: destinationMetadata.chainId,
        destinationChainName,
        mailboxAddress: mailbox.address,
        calldata,
      }),
    );
  } catch (error) {
    logger.error('Unable to prepare self-relay transaction', error);
    return res.status(500).json({
      status: 'error',
      error: 'Unable to prepare relay transaction',
    });
  }
}

async function getRelayContext() {
  relayContextPromise ??= createRelayContext();
  try {
    return await relayContextPromise;
  } catch (error) {
    relayContextPromise = undefined;
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
  return { coreAddresses, multiProvider, core };
}
