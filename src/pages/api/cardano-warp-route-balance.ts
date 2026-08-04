import { GithubRegistry } from '@hyperlane-xyz/registry';
import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { WarpRouteConfigs } from '@hyperlane-xyz/sdk/warp/read';
import type { NextApiRequest, NextApiResponse } from 'next';

import { config } from '../../consts/config';
import { SUPPORTED_CARDANO_BALANCE_STANDARDS } from '../../features/messages/warpVisualization/tokenStandards';
import { logger } from '../../utils/logger';

/**
 * Locked-collateral balance for the Cardano leg of a warp route.
 *
 * Read server-side for the same reason Sealevel is: the browser bundle has no
 * Cardano provider. Blockfrost also needs a project id, which must not reach
 * the client.
 *
 * A Cardano warp route keeps its state in a single UTXO marked by a one-shot
 * NFT whose policy is the route's identity, with an empty asset name — the same
 * lookup the agents do (`find_utxo_by_nft(policy, "")` in recipient_resolver).
 * The locked ADA is that UTXO's lovelace.
 *
 * The empty name is load-bearing: the policy also mints a `"ref"`-named asset
 * marking the reference-script UTXO, so enumerating the policy is ambiguous and
 * only the unnamed asset identifies the state. A synthetic route's *token* does
 * carry a real asset name, but that is a different policy (`mintingPolicy`) and
 * not what identifies the route here.
 *
 * Native routes only: a collateral route locks a native asset rather than ADA
 * and would need a token-policy mapping first.
 */

const CARDANO_STANDARDS = new Set<string>(SUPPORTED_CARDANO_BALANCE_STANDARDS);
const REGISTRY_DATA_CACHE_MS = 5 * 60 * 1000;
// Hyperlane pads Cardano's 28-byte credentials to 32 bytes:
// [kind, 0x00, 0x00, 0x00, ...28-byte hash]. For a warp route the credential is
// the state NFT's minting policy.
const CARDANO_HYPERLANE_ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;

interface RegistryData {
  chains: Record<string, ChainMetadata>;
  warpRouteConfigs: WarpRouteConfigs;
}

let registryDataRequest: Promise<RegistryData> | null = null;
let registryDataExpiresAt = 0;

function getSingleQueryParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

async function getRegistryData(): Promise<RegistryData> {
  if (registryDataRequest && Date.now() < registryDataExpiresAt) return registryDataRequest;

  const registry = new GithubRegistry({
    uri: config.registryUrl,
    branch: config.registryBranch,
    proxyUrl: config.githubProxy,
  });
  registryDataRequest = (async () => ({
    chains: await registry.getMetadata(),
    warpRouteConfigs: await registry.getWarpRoutes(),
  }))();
  registryDataExpiresAt = Date.now() + REGISTRY_DATA_CACHE_MS;

  try {
    return await registryDataRequest;
  } catch (error) {
    registryDataRequest = null;
    registryDataExpiresAt = 0;
    throw error;
  }
}

/** Only serve tokens the configured registry actually declares. */
function isRegisteredTokenRequest(
  warpRouteConfigs: WarpRouteConfigs,
  request: { chainName: string; addressOrDenom: string; standard: string },
): boolean {
  return Object.values(warpRouteConfigs).some((warpRoute) =>
    warpRoute.tokens.some(
      (token) =>
        token.chainName === request.chainName &&
        token.standard === request.standard &&
        token.addressOrDenom?.toLowerCase() === request.addressOrDenom.toLowerCase(),
    ),
  );
}

/** The 28-byte policy id carried in bytes 4..32 of the Hyperlane address. */
function policyIdFromHyperlaneAddress(addressOrDenom: string): string {
  return addressOrDenom.replace(/^0x/, '').slice(8);
}

async function blockfrost(baseUrl: string, apiKey: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    headers: { project_id: apiKey },
  });
  if (!response.ok) {
    throw new Error(`Blockfrost ${response.status} for ${path}`);
  }
  return response.json();
}

/**
 * Lovelace held by the UTXO carrying the route's state NFT.
 *
 * Two reads: the addresses holding the asset, then that address's UTXOs
 * narrowed to the one actually carrying it — a script address can hold
 * unrelated UTXOs, and only the marked one is the route's state.
 */
async function fetchLockedLovelace(
  baseUrl: string,
  apiKey: string,
  policyId: string,
): Promise<bigint | undefined> {
  // The asset id is the bare policy: 28-byte policy + empty asset name.
  const holders = await blockfrost(baseUrl, apiKey, `/assets/${policyId}/addresses`);
  if (!Array.isArray(holders) || holders.length === 0) return undefined;
  const address = (holders[0] as { address?: string }).address;
  if (!address) return undefined;

  const utxos = await blockfrost(baseUrl, apiKey, `/addresses/${address}/utxos/${policyId}`);
  if (!Array.isArray(utxos) || utxos.length === 0) return undefined;

  let lovelace = 0n;
  for (const utxo of utxos) {
    const amounts = (utxo as { amount?: Array<{ unit?: string; quantity?: string }> }).amount ?? [];
    const entry = amounts.find((a) => a.unit === 'lovelace');
    if (entry?.quantity) lovelace += BigInt(entry.quantity);
  }
  return lovelace;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const chainName = getSingleQueryParam(req.query.chainName);
  const addressOrDenom = getSingleQueryParam(req.query.addressOrDenom);
  const standard = getSingleQueryParam(req.query.standard);

  if (!chainName || !addressOrDenom || !standard || !CARDANO_STANDARDS.has(standard)) {
    return res.status(400).json({ error: 'Unsupported balance request' });
  }
  if (!CARDANO_HYPERLANE_ADDRESS_REGEX.test(addressOrDenom)) {
    return res.status(400).json({ error: 'Invalid Cardano address' });
  }

  const apiKey = process.env.BLOCKFROST_API_KEY;
  if (!apiKey) {
    logger.debug('BLOCKFROST_API_KEY not set; cannot read Cardano warp route balance');
    return res.status(501).json({ error: 'Cardano balance reads not configured' });
  }

  try {
    const { chains, warpRouteConfigs } = await getRegistryData();
    const chain = chains[chainName];
    if (!chain || chain.protocol !== 'cardano') {
      return res.status(400).json({ error: 'Unsupported chain' });
    }
    if (!isRegisteredTokenRequest(warpRouteConfigs, { chainName, addressOrDenom, standard })) {
      return res.status(400).json({ error: 'Unknown warp route token' });
    }

    const baseUrl = chain.rpcUrls[0]?.http;
    if (!baseUrl) return res.status(400).json({ error: 'Chain has no rpc url' });

    const lovelace = await fetchLockedLovelace(
      baseUrl,
      apiKey,
      policyIdFromHyperlaneAddress(addressOrDenom),
    );
    if (lovelace === undefined) {
      return res.status(404).json({ error: 'Warp route state UTXO not found' });
    }

    return res.status(200).json({ balance: lovelace.toString() });
  } catch (error) {
    logger.error('Failed to read Cardano warp route balance', error);
    return res.status(502).json({ error: 'Failed to read balance' });
  }
}
