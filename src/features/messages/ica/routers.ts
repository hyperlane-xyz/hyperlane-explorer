import { chainAddresses } from '@hyperlane-xyz/registry';
import type { ChainMap } from '@hyperlane-xyz/sdk';
import { addressToBytes32 } from '@hyperlane-xyz/utils';
import { providers } from 'ethers';

import { logger } from '../../../utils/logger';

// Build a map of chainName -> ICA router address from the registry
function buildIcaRouterAddressMap(): ChainMap<Address> {
  const map: ChainMap<Address> = {};

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

// Normalize to bytes32 hex so registry entries (EVM-style 0x hex) and
// resolved message addresses (e.g. base58 for Tron) compare equal when they
// represent the same on-chain contract.
function toCanonicalBytes32(addr: Address): string | null {
  if (!addr) return null;
  try {
    return addressToBytes32(addr).toLowerCase();
  } catch {
    return null;
  }
}

// Get all known ICA router addresses, canonicalized to bytes32 hex
function getIcaRouterBytes32Set(): Set<string> {
  const set = new Set<string>();
  for (const addr of Object.values(ICA_ROUTER_MAP)) {
    const canonical = toCanonicalBytes32(addr);
    if (canonical) set.add(canonical);
  }
  return set;
}

/**
 * Check if an address is a known ICA router
 */
export function isAddressIcaRouter(addr: Address): boolean {
  if (!addr) return false;
  try {
    const canonical = toCanonicalBytes32(addr);
    if (!canonical) return false;
    return getIcaRouterBytes32Set().has(canonical);
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
 * Get the ICA router address for a given chain
 */
export function getIcaRouterAddress(chainName: string): Address | undefined {
  return ICA_ROUTER_MAP[chainName];
}

/**
 * Compute the ICA address for a given owner on the destination chain.
 * This is a non-hook version for use in non-React contexts like the debugger.
 *
 * @param originDomainId - The origin chain's domain ID
 * @param owner - The owner address on the origin chain
 * @param originRouter - The ICA router address on the origin chain
 * @param destRouter - The ICA router address on the destination chain
 * @param ism - Optional ISM address (uses default if not specified)
 * @param salt - Optional salt (uses zero salt if not specified)
 * @param destProvider - Provider for the destination chain
 * @returns The derived ICA address, or null if computation fails
 */
export async function computeIcaAddress(
  originDomainId: number,
  owner: string,
  originRouter: string,
  destRouter: string,
  ism: string | undefined,
  salt: string | undefined,
  destProvider: providers.Provider,
): Promise<string | null> {
  try {
    // eslint-disable-next-line camelcase
    const { InterchainAccountRouter__factory } = await import('@hyperlane-xyz/core');
    const router = InterchainAccountRouter__factory.connect(destRouter, destProvider);

    // Use zero address for ISM if not specified (will use default ISM)
    const ismAddress = ism || '0x0000000000000000000000000000000000000000';
    const userSalt = salt || '0x' + '0'.repeat(64);

    // Get the ICA address using the contract with salt
    // Signature: getLocalInterchainAccount(uint32,bytes32,bytes32,address,bytes32)
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
    logger.error('Error computing ICA address', error);
    return null;
  }
}
