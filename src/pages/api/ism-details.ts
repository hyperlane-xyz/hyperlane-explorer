/**
 * API endpoint for fetching ISM details and validator signature status.
 * Uses the SDK's BaseMetadataBuilder to get the full rich result including validator status.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

import { GithubRegistry } from '@hyperlane-xyz/registry';
import type { MetadataBuildResult } from '@hyperlane-xyz/sdk';
import {
  BaseMetadataBuilder,
  DerivedIsmConfig,
  EvmHookReader,
  EvmIsmReader,
  HyperlaneCore,
  MultiProvider,
} from '@hyperlane-xyz/sdk';

// DerivedHookConfig is WithAddress<Exclude<HookConfig, Address>>
// Using any for now until SDK exports this type
type DerivedHookConfig = any;

import { config as appConfig } from '../../consts/config';
import { logger } from '../../utils/logger';

// Cache for registry, multiProvider and core
let cachedRegistry: GithubRegistry | null = null;
let cachedMultiProvider: MultiProvider | null = null;
let cachedCore: HyperlaneCore | null = null;
let cachedMetadataBuilder: BaseMetadataBuilder | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

// Cache for ISM and Hook configs - these are relatively static and expensive to derive
// ISM cache key includes origin chain because routing ISMs route based on origin
// Key format for ISM: `${destinationChain}:${originChain}:${address}`
// Key format for Hook: `${originChain}:${address}`
const ismConfigCache = new Map<string, { config: DerivedIsmConfig; timestamp: number }>();
const hookConfigCache = new Map<string, { config: DerivedHookConfig; timestamp: number }>();
const CONFIG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes - ISM/Hook configs rarely change

function getIsmCacheKey(destinationChain: string, originChain: string, address: string): string {
  return `${destinationChain}:${originChain}:${address.toLowerCase()}`;
}

function getHookCacheKey(chain: string, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
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

  // Get addresses for all chains to build HyperlaneCore
  const chainNames = Object.keys(chainMetadata);
  const addressesMap: Record<string, any> = {};

  for (const chainName of chainNames) {
    try {
      const addresses = await registry.getChainAddresses(chainName);
      if (addresses) {
        addressesMap[chainName] = addresses;
      }
    } catch (_e) {
      // Skip chains without addresses
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
    const { originTxHash, messageId } = req.body;

    if (!originTxHash || !messageId) {
      return res.status(400).json({ error: 'Missing required fields: originTxHash, messageId' });
    }

    const { multiProvider, core, metadataBuilder, fromCache } = await getRegistryAndCore();
    timer.mark('getRegistryAndCore');
    logger.info(
      `[TIMING] getRegistryAndCore took ${timer.getTimings().getRegistryAndCore}ms (fromCache: ${fromCache})`,
    );

    // We need to find which chain this transaction is on
    // For now, require the origin domain to be passed
    const { originDomain } = req.body;
    if (!originDomain) {
      return res.status(400).json({ error: 'Missing required field: originDomain' });
    }

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
    const hookCacheKey = getHookCacheKey(originChain, senderHook);

    const cachedIsmConfig = ismConfigCache.get(ismCacheKey);
    const cachedHookConfig = hookConfigCache.get(hookCacheKey);

    const ismCacheValid = cachedIsmConfig && now - cachedIsmConfig.timestamp < CONFIG_CACHE_TTL;
    const hookCacheValid = cachedHookConfig && now - cachedHookConfig.timestamp < CONFIG_CACHE_TTL;

    let ismFromCache = false;
    let hookFromCache = false;

    // Derive configs in parallel if needed, use cache if available
    const ismConfigPromise: Promise<DerivedIsmConfig> = ismCacheValid
      ? ((ismFromCache = true),
        logger.info(`[TIMING] ISM config cache HIT for ${ismCacheKey}`),
        Promise.resolve(cachedIsmConfig!.config))
      : (async () => {
          logger.info(`[TIMING] ISM config cache MISS for ${ismCacheKey}, will derive...`);
          const ismConfigStart = Date.now();
          // Pass message context to EvmIsmReader for optimized routing ISM derivation
          const evmIsmReader = new EvmIsmReader(
            multiProvider,
            destinationChain,
            undefined,
            message,
          );
          const result = await evmIsmReader.deriveIsmConfig(recipientIsm);
          logger.info(`[TIMING] deriveIsmConfig completed in ${Date.now() - ismConfigStart}ms`);
          // Cache with specific origin chain key
          ismConfigCache.set(ismCacheKey, { config: result, timestamp: now });
          return result;
        })();

    const hookConfigPromise: Promise<DerivedHookConfig> = hookCacheValid
      ? ((hookFromCache = true),
        logger.info(`[TIMING] Hook config cache HIT for ${hookCacheKey}`),
        Promise.resolve(cachedHookConfig!.config))
      : (async () => {
          logger.info(`[TIMING] Hook config cache MISS for ${hookCacheKey}, will derive...`);
          const hookConfigStart = Date.now();
          // Pass message context to EvmHookReader for optimized routing hook derivation
          const evmHookReader = new EvmHookReader(multiProvider, originChain, undefined, message);
          const result = await evmHookReader.deriveHookConfig(senderHook);
          logger.info(`[TIMING] deriveHookConfig completed in ${Date.now() - hookConfigStart}ms`);
          hookConfigCache.set(hookCacheKey, { config: result, timestamp: now });
          return result;
        })();

    // Wait for both configs (runs in parallel)
    const [ismConfig, hookConfig] = await Promise.all([ismConfigPromise, hookConfigPromise]);

    timer.mark('deriveIsmAndHookConfig');
    logger.info(`[TIMING] ISM fromCache: ${ismFromCache}, Hook fromCache: ${hookFromCache}`);

    logger.info('[TIMING] Pre-metadata build timings:', timer.getTimings());

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
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// Vercel serverless function configuration
// Increase timeout for cold starts with registry loading
export const config = {
  maxDuration: 60, // 60 seconds (requires Pro plan, falls back to plan limit)
};
