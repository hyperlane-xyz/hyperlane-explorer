/**
 * API endpoint for fetching ISM details and validator signature status.
 * Uses BaseMetadataBuilder from @hyperlane-xyz/relayer for rich validator status.
 */

import { GithubRegistry } from '@hyperlane-xyz/registry';
import { BaseMetadataBuilder } from '@hyperlane-xyz/relayer';
import {
  DerivedHookConfig,
  DerivedIsmConfig,
  EvmHookReader,
  EvmIsmReader,
  HyperlaneCore,
  MultiProvider,
} from '@hyperlane-xyz/sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

import { config as appConfig } from '../../consts/config';
import type { MetadataBuildResult } from '../../features/debugger/metadataTypes';
import { logger } from '../../utils/logger';

// Cache for registry, multiProvider and core
// Note: Vercel serverless functions may re-instance globals between requests,
// so this is best-effort caching that helps within a single warm instance.
let cachedRegistry: GithubRegistry | null = null;
let cachedMultiProvider: MultiProvider | null = null;
let cachedCore: HyperlaneCore | null = null;
let cachedMetadataBuilder: BaseMetadataBuilder | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

// Cache for ISM and Hook configs - these are relatively static and expensive to derive
// ISM key: `${destinationChain}:${originChain}:${address}`
// Hook key: `${originChain}:${destinationChain}:${address}`
const ismConfigCache = new Map<string, { config: DerivedIsmConfig; timestamp: number }>();
const hookConfigCache = new Map<string, { config: DerivedHookConfig; timestamp: number }>();
const CONFIG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes - ISM/Hook configs rarely change
const MAX_CACHE_SIZE = 500;

function evictIfFull(cache: Map<string, { timestamp: number }>) {
  if (cache.size < MAX_CACHE_SIZE) return;
  // Evict oldest entry (Map iteration order is insertion order)
  const oldestKey = cache.keys().next().value;
  if (oldestKey) cache.delete(oldestKey);
}

function getIsmCacheKey(destinationChain: string, originChain: string, address: string): string {
  return `${destinationChain}:${originChain}:${address.toLowerCase()}`;
}

function getHookCacheKey(originChain: string, destinationChain: string, address: string): string {
  return `${originChain}:${destinationChain}:${address.toLowerCase()}`;
}

// Timing helper
function createTimer() {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  let lastMark = startTime;

  return {
    mark(label: string) {
      const now = Date.now();
      timings[label] = now - lastMark;
      lastMark = now;
    },
    getTimings(): Record<string, number> & { total: number } {
      return {
        ...timings,
        total: Date.now() - startTime,
      };
    },
  };
}

async function getRegistryAndCore() {
  const timer = createTimer();
  const now = Date.now();
  if (
    cachedRegistry &&
    cachedMultiProvider &&
    cachedCore &&
    cachedMetadataBuilder &&
    now - cacheTimestamp < CACHE_TTL
  ) {
    logger.info('[TIMING] getRegistryAndCore: cache HIT');
    return {
      registry: cachedRegistry,
      multiProvider: cachedMultiProvider,
      core: cachedCore,
      metadataBuilder: cachedMetadataBuilder,
      fromCache: true,
    };
  }

  logger.info('[TIMING] getRegistryAndCore: cache MISS, loading registry...');

  const registry = new GithubRegistry({
    proxyUrl: appConfig.githubProxy,
    uri: appConfig.registryUrl,
    branch: appConfig.registryBranch,
  });

  timer.mark('registry_create');

  await registry.listRegistryContent();
  timer.mark('listRegistryContent');

  const chainMetadata = await registry.getMetadata();
  timer.mark('getMetadata');

  const multiProvider = new MultiProvider(chainMetadata);
  timer.mark('multiProvider_create');

  // Get addresses for all chains to build HyperlaneCore (parallel)
  const chainNames = Object.keys(chainMetadata);
  const addressResults = await Promise.allSettled(
    chainNames.map(async (name) => {
      const addresses = await registry.getChainAddresses(name);
      return { name, addresses };
    }),
  );
  const addressesMap: Record<string, any> = {};
  for (const r of addressResults) {
    if (r.status === 'fulfilled' && r.value.addresses) {
      addressesMap[r.value.name] = r.value.addresses;
    }
  }
  timer.mark('getChainAddresses_all');

  const core = HyperlaneCore.fromAddressesMap(addressesMap, multiProvider);
  timer.mark('core_create');

  const metadataBuilder = new BaseMetadataBuilder(core);
  timer.mark('metadataBuilder_create');

  cachedRegistry = registry;
  cachedMultiProvider = multiProvider;
  cachedCore = core;
  cachedMetadataBuilder = metadataBuilder;
  cacheTimestamp = now;

  logger.info('[TIMING] getRegistryAndCore timings:', timer.getTimings());

  return { registry, multiProvider, core, metadataBuilder, fromCache: false };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const timer = createTimer();

  try {
    const { originTxHash, messageId, originDomain } = req.body;

    // Validate all required fields upfront
    if (!originTxHash || !messageId || !originDomain) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: originTxHash, messageId, originDomain' });
    }

    const { multiProvider, core, metadataBuilder, fromCache } = await getRegistryAndCore();
    timer.mark('getRegistryAndCore');
    logger.info(
      `[TIMING] getRegistryAndCore: ${timer.getTimings().getRegistryAndCore}ms (cache: ${fromCache})`,
    );

    const originChain = multiProvider.tryGetChainName(originDomain);
    if (!originChain) {
      return res.status(400).json({ error: 'Unknown origin domain' });
    }

    // Get the dispatch transaction receipt
    const provider = multiProvider.getProvider(originChain);
    const dispatchTx = await provider.getTransactionReceipt(originTxHash);
    timer.mark('getTransactionReceipt');

    if (!dispatchTx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Get dispatched messages from the transaction
    const messages = HyperlaneCore.getDispatchedMessages(dispatchTx);

    // Find the specific message we're looking for
    const message = messages.find((m) => m.id.toLowerCase() === messageId.toLowerCase());
    if (!message) {
      return res.status(404).json({ error: 'Message not found in transaction' });
    }
    timer.mark('parseMessages');

    const destinationChain = multiProvider.tryGetChainName(message.parsed.destination);
    if (!destinationChain) {
      return res.status(400).json({ error: 'Unknown destination domain' });
    }

    // Get ISM and Hook addresses
    const recipientIsm = await core.getRecipientIsmAddress(message);
    timer.mark('getRecipientIsmAddress');

    const senderHook = await core.getSenderHookAddress(message);
    timer.mark('getSenderHookAddress');

    logger.info(`[TIMING] recipientIsm: ${recipientIsm}, senderHook: ${senderHook}`);

    // Check caches
    const now = Date.now();

    // ISM cache key includes origin chain because routing ISMs route based on origin
    const ismCacheKey = getIsmCacheKey(destinationChain, originChain, recipientIsm);
    const hookCacheKey = getHookCacheKey(originChain, destinationChain, senderHook);

    const cachedIsmConfig = ismConfigCache.get(ismCacheKey);
    const cachedHookConfig = hookConfigCache.get(hookCacheKey);

    const ismCacheValid = cachedIsmConfig && now - cachedIsmConfig.timestamp < CONFIG_CACHE_TTL;
    const hookCacheValid = cachedHookConfig && now - cachedHookConfig.timestamp < CONFIG_CACHE_TTL;

    const ismFromCache = ismCacheValid;
    const hookFromCache = hookCacheValid;

    // Derive configs in parallel if needed, use cache if available
    const ismConfigPromise: Promise<DerivedIsmConfig> = ismFromCache
      ? Promise.resolve(cachedIsmConfig!.config)
      : (async () => {
          const evmIsmReader = new EvmIsmReader(
            multiProvider,
            destinationChain,
            undefined,
            message,
          );
          const result = await evmIsmReader.deriveIsmConfig(recipientIsm);
          evictIfFull(ismConfigCache);
          ismConfigCache.set(ismCacheKey, { config: result, timestamp: now });
          return result;
        })();

    const hookConfigPromise: Promise<DerivedHookConfig> = hookFromCache
      ? Promise.resolve(cachedHookConfig!.config)
      : (async () => {
          const evmHookReader = new EvmHookReader(multiProvider, originChain, undefined, message);
          const result = await evmHookReader.deriveHookConfig(senderHook);
          evictIfFull(hookConfigCache);
          hookConfigCache.set(hookCacheKey, { config: result, timestamp: now });
          return result;
        })();

    // Wait for both configs (runs in parallel)
    const [ismConfig, hookConfig] = await Promise.all([ismConfigPromise, hookConfigPromise]);

    timer.mark('deriveIsmAndHookConfig');

    // Build metadata (this includes validator signature status)
    const result: MetadataBuildResult = await metadataBuilder.build({
      message,
      dispatchTx,
      ism: ismConfig,
      hook: hookConfig,
    });
    timer.mark('metadataBuilder_build');

    const finalTimings = timer.getTimings();
    logger.info('[TIMING] Final timings:', finalTimings);
    logger.info(`[TIMING] TOTAL: ${finalTimings.total}ms`);

    // Include debug info only in development mode
    const response: any = { result };
    if (appConfig.debug) {
      response._timings = finalTimings;
      response._cache = {
        registry: fromCache,
        ismConfig: ismFromCache,
        hookConfig: hookFromCache,
      };
    }

    return res.status(200).json(response);
  } catch (error: any) {
    logger.error('Error fetching ISM details:', error);
    logger.error('[TIMING] Error occurred after:', timer.getTimings());
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Vercel serverless function configuration
// Increase timeout for cold starts with registry loading
export const config = {
  maxDuration: 60, // 60 seconds (requires Pro plan, falls back to plan limit)
};
