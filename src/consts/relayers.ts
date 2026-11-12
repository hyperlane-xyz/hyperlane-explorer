import { shortenAddress } from '@hyperlane-xyz/utils';

// Public signer identities from hyperlane-monorepo/typescript/infra/config/relayer.json.
// Match full addresses, since address suffixes alone are not unique identities.
const relayerNames: Readonly<Record<string, string>> = {
  '0x74cae0ecc47b02ed9b9d32e000fd70b9417970c5': 'Mainnet Omniscient',
  '0x09b96417602ed6ac76651f7a8c4860e60e3aa6d0': 'Mainnet Omniscient RC',
  '0x1e100476e9360b11a592eafe1c90328368e547b6': 'Mainnet Fast Path',
  '0x16626cd24fd1f228a031e48b77602ae25f8930db': 'Testnet Omniscient',
  '0x7fe8c60ead4ab10be736f4de2b3090db5a851f16': 'Testnet Omniscient RC',
  '0xde216ffd0f7319860f966191d995c250d6070ba2': 'Testnet Fast Path',
};

export function getRelayerName(address: string): string | undefined {
  return relayerNames[address.toLowerCase()];
}

export function getRelayerLabel(address: string): string {
  return getRelayerName(address) ?? shortenAddress(address);
}
