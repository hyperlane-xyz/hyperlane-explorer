import { links } from '../consts/links';

import { logger } from './logger';

/**
 * WARNING: These regex-based YAML parsing utilities are fragile and depend on the exact
 * format of YAML files from the Hyperlane registry. If the YAML structure changes
 * (e.g., different indentation, field order, or syntax), parsing will break.
 * Consider using a proper YAML parser if the format becomes unstable.
 *
 * We avoid adding a full YAML parser dependency to keep the Edge runtime bundle small.
 */

// ============================================================================
// Chain Metadata Parsing
// ============================================================================

export interface ChainDisplayNames {
  displayName: string;
  displayNameShort?: string;
}

/**
 * Parse chain metadata from registry YAML format.
 * Expects format:
 * ```
 * chainname:
 *   displayName: Chain Name
 *   displayNameShort: CN
 *   ...
 * ```
 */
export function parseChainMetadataYaml(yaml: string): Map<string, ChainDisplayNames> {
  const map = new Map<string, ChainDisplayNames>();

  // Split on chain name entries (lines starting with a word followed by colon at column 0)
  const chainSections = yaml.split(/^(?=\w+:$)/m);

  for (const section of chainSections) {
    const lines = section.trim().split('\n');
    if (lines.length === 0) continue;

    const chainNameMatch = lines[0].match(/^(\w+):$/);
    if (!chainNameMatch) continue;
    const chainName = chainNameMatch[1];

    const displayNameMatch = section.match(/^\s+displayName:\s*(.+)$/m);
    const displayNameShortMatch = section.match(/^\s+displayNameShort:\s*(.+)$/m);

    if (displayNameMatch) {
      map.set(chainName, {
        displayName: displayNameMatch[1].trim(),
        displayNameShort: displayNameShortMatch?.[1]?.trim(),
      });
    }
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
  const metadata = chainMetadata.get(chainName.toLowerCase());
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

/**
 * Parse warp route configs from registry YAML format.
 * Expects format with token entries starting with "    - addressOrDenom:"
 */
export function parseWarpRouteConfigYaml(yaml: string): WarpRouteMap {
  const map: WarpRouteMap = new Map();

  // Split YAML into token entries (each starts with "    - addressOrDenom:")
  const tokenBlocks = yaml.split(/^ {4}- addressOrDenom:/gm).slice(1);

  for (const block of tokenBlocks) {
    // Parse each field independently since order varies
    const addressMatch = block.match(/^\s*"?([^"\n]+)"?/);
    const chainMatch = block.match(/^\s+chainName:\s*(\w+)/m);
    const decimalsMatch = block.match(/^\s+decimals:\s*(\d+)/m);
    const logoMatch = block.match(/^\s+logoURI:\s*([^\n]+)/m);
    const nameMatch = block.match(/^\s+name:\s*([^\n]+)/m);
    const symbolMatch = block.match(/^\s+symbol:\s*([^\n]+)/m);

    if (addressMatch && chainMatch && decimalsMatch && symbolMatch) {
      const addressOrDenom = addressMatch[1].trim();
      const chainName = chainMatch[1].trim();
      const decimals = parseInt(decimalsMatch[1], 10);
      const logoURI = logoMatch?.[1]?.trim() || '';
      const name = nameMatch?.[1]?.trim() || '';
      const symbol = symbolMatch[1].trim();

      if (!map.has(chainName)) {
        map.set(chainName, new Map());
      }

      const chainMap = map.get(chainName)!;
      const normalizedAddress = addressOrDenom.toLowerCase();

      chainMap.set(normalizedAddress, {
        addressOrDenom,
        chainName,
        decimals,
        logoURI: logoURI.startsWith('/') ? `${links.imgPath}${logoURI}` : logoURI,
        name,
        symbol,
      });
    }
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
