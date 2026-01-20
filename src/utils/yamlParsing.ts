import YAML from 'yaml';

import { links } from '../consts/links';

import { logger } from './logger';

// ============================================================================
// Address Utilities (Edge-compatible)
// ============================================================================

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode a base58 string to bytes (Edge-compatible, no Buffer)
 */
function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`Invalid base58 character: ${char}`);

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading zeros
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Convert address to lowercase hex format.
 * Handles both 0x-prefixed hex and base58 (Solana) addresses.
 */
function normalizeAddressToHex(address: string): string {
  if (address.startsWith('0x')) {
    return address.toLowerCase();
  }

  // Assume base58 (Solana/SVM address)
  try {
    const bytes = base58Decode(address);
    const hex =
      '0x' +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return hex.toLowerCase();
  } catch {
    // If decoding fails, return as-is lowercase
    return address.toLowerCase();
  }
}

const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad && bits > 0) {
    result.push((acc << (toBits - bits)) & maxv);
  }

  return result;
}

function bech32Checksum(hrp: string, data: number[]): number[] {
  const values = [
    ...hrp.split('').map((c) => c.charCodeAt(0) >> 5),
    0,
    ...hrp.split('').map((c) => c.charCodeAt(0) & 31),
    ...data,
  ];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) {
        chk ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i];
      }
    }
  }
  chk ^= 1;
  return [0, 1, 2, 3, 4, 5].map((i) => (chk >> (5 * (5 - i))) & 31);
}

function bech32Encode(prefix: string, data: Uint8Array): string {
  const words = convertBits(data, 8, 5, true);
  const checksum = bech32Checksum(prefix, words);
  return prefix + '1' + [...words, ...checksum].map((d) => BECH32_ALPHABET[d]).join('');
}

export function bytes32ToProtocolAddress(
  bytes32Hex: string,
  protocol: string,
  bech32Prefix?: string,
): string {
  const hex = bytes32Hex.replace(/^0x/i, '').toLowerCase();

  if (protocol === 'cosmos' && bech32Prefix) {
    const addressHex = hex.slice(-40);
    const bytes = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      bytes[i] = parseInt(addressHex.slice(i * 2, i * 2 + 2), 16);
    }
    return bech32Encode(bech32Prefix, bytes);
  }

  return '0x' + hex;
}

// ============================================================================
// Chain Metadata Parsing
// ============================================================================

export interface ChainDisplayNames {
  displayName: string;
  displayNameShort?: string;
  protocol?: string;
  bech32Prefix?: string;
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
      { displayName?: string; displayNameShort?: string; protocol?: string; bech32Prefix?: string }
    >;
    for (const [chainName, metadata] of Object.entries(data)) {
      if (metadata?.displayName) {
        map.set(chainName, {
          displayName: metadata.displayName,
          displayNameShort: metadata.displayNameShort,
          protocol: metadata.protocol,
          bech32Prefix: metadata.bech32Prefix,
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
  // Wire format decimals = max decimals among all tokens in this warp route
  // Used for decoding scaled amounts in message body (see og.tsx for details)
  wireDecimals: number;
  scale?: number;
  logoURI: string;
  chainName: string;
  addressOrDenom: string;
  standard?: string;
}

// Map of chainName -> lowercase address -> token info
export type WarpRouteMap = Map<string, Map<string, WarpToken>>;

interface WarpRouteConfigEntry {
  addressOrDenom?: string;
  chainName?: string;
  decimals?: number;
  scale?: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  standard?: string;
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

      // Calculate max decimals for this warp route (wire format decimals)
      // This is how warp routes normalize amounts across chains with different decimals
      const wireDecimals = route.tokens.reduce(
        (max, t) => (t.decimals !== undefined && t.decimals > max ? t.decimals : max),
        0,
      );

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
        const normalizedAddress = normalizeAddressToHex(token.addressOrDenom);
        const logoURI = token.logoURI || '';

        chainMap.set(normalizedAddress, {
          addressOrDenom: token.addressOrDenom,
          chainName,
          decimals: token.decimals,
          scale: token.scale,
          wireDecimals,
          logoURI: logoURI.startsWith('/') ? `${links.imgPath}${logoURI}` : logoURI,
          name: token.name || '',
          symbol: token.symbol,
          standard: token.standard,
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
