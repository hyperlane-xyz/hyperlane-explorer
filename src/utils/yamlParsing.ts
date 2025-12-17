import YAML from 'yaml';

import { links } from '../consts/links';

import { logger } from './logger';

// ============================================================================
// Chain Metadata Parsing
// ============================================================================

export interface ChainDisplayNames {
  displayName: string;
  displayNameShort?: string;
}

/**
 * Parse chain metadata from registry YAML format.
 * Returns a map of chain name -> display names
 */
export function parseChainMetadataYaml(yamlStr: string): Map<string, ChainDisplayNames> {
  const map = new Map<string, ChainDisplayNames>();

  try {
    const data = YAML.parse(yamlStr) as Record<
      string,
      { displayName?: string; displayNameShort?: string }
    >;
    for (const [chainName, metadata] of Object.entries(data)) {
      if (metadata?.displayName) {
        map.set(chainName, {
          displayName: metadata.displayName,
          displayNameShort: metadata.displayNameShort,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to parse chain metadata YAML:', error);
  }

  return map;
}

/**
 * Fetch and parse chain metadata from the registry
 */
export async function fetchChainMetadata(): Promise<Map<string, ChainDisplayNames>> {
  try {
    const response = await fetch(`${links.imgPath}/chains/metadata.yaml`);
    if (!response.ok) return new Map();

    const yaml = await response.text();
    return parseChainMetadataYaml(yaml);
  } catch (error) {
    logger.error('Error fetching chain metadata:', error);
    return new Map();
  }
}

/**
 * Get display name for a chain, preferring displayNameShort
 */
export function getChainDisplayName(
  chainName: string,
  chainMetadata: Map<string, ChainDisplayNames>,
): string {
  const metadata = chainMetadata.get(chainName);
  if (metadata) {
    return metadata.displayNameShort ?? metadata.displayName;
  }
  // Fallback to title case
  return chainName
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// Warp Route Config Parsing
// ============================================================================

export interface WarpToken {
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
  chainName: string;
  addressOrDenom: string;
}

// Map of chainName -> lowercase address -> token info
export type WarpRouteMap = Map<string, Map<string, WarpToken>>;

interface WarpRouteConfigEntry {
  addressOrDenom?: string;
  chainName?: string;
  decimals?: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
}

interface WarpRouteConfig {
  tokens?: WarpRouteConfigEntry[];
}

/**
 * Parse warp route configs from registry YAML format.
 * Returns a map of chainName -> address -> token info
 */
export function parseWarpRouteConfigYaml(yamlStr: string): WarpRouteMap {
  const map: WarpRouteMap = new Map();

  try {
    const data = YAML.parse(yamlStr) as Record<string, WarpRouteConfig>;

    for (const route of Object.values(data)) {
      if (!route?.tokens) continue;

      for (const token of route.tokens) {
        if (
          !token.addressOrDenom ||
          !token.chainName ||
          token.decimals === undefined ||
          !token.symbol
        ) {
          continue;
        }

        const chainName = token.chainName;
        if (!map.has(chainName)) {
          map.set(chainName, new Map());
        }

        const chainMap = map.get(chainName)!;
        const normalizedAddress = token.addressOrDenom.toLowerCase();
        const logoURI = token.logoURI || '';

        chainMap.set(normalizedAddress, {
          addressOrDenom: token.addressOrDenom,
          chainName,
          decimals: token.decimals,
          logoURI: logoURI.startsWith('/') ? `${links.imgPath}${logoURI}` : logoURI,
          name: token.name || '',
          symbol: token.symbol,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to parse warp route config YAML:', error);
  }

  return map;
}

/**
 * Fetch and parse warp route configs from the registry
 */
export async function fetchWarpRouteMap(): Promise<WarpRouteMap> {
  try {
    const response = await fetch(`${links.imgPath}/deployments/warp_routes/warpRouteConfigs.yaml`);
    if (!response.ok) return new Map();

    const yaml = await response.text();
    return parseWarpRouteConfigYaml(yaml);
  } catch (error) {
    logger.error('Error fetching warp route map:', error);
    return new Map();
  }
}
