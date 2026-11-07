import type { DiagnosticModule } from './types';

export interface ValidatorSignature {
  address: string;
  status: 'collected' | 'unavailable' | 'unknown';
  reason?: string;
}

// Validator checkpoint signers use EVM addresses, independently of the ISM program's VM.
function signerAddress(value: string): string | undefined {
  if (/^0x[\da-f]{40}$/i.test(value)) return value.toLowerCase();
  if (/^0x0{24}[\da-f]{40}$/i.test(value)) return `0x${value.slice(-40).toLowerCase()}`;
  return undefined;
}

export function getValidatorSignatures(node: DiagnosticModule): ValidatorSignature[] {
  const signatures = node.signatures;
  const configured = node.validators ?? [];
  const key = (address: string) => signerAddress(address) ?? address;
  const unavailable = new Map(
    (signatures?.unavailable ?? []).map((entry) => [key(entry.validator), entry.reason]),
  );
  const discovery = new Map(
    (signatures?.discovery_unavailable ?? []).map((entry) => [key(entry.validator), entry.reason]),
  );
  const configuredSet = new Set(configured.map(key));
  const addresses = [
    ...new Set([
      ...configuredSet,
      ...unavailable.keys(),
      ...discovery.keys(),
      ...(signatures?.latest_indices ?? []).map((entry) => key(entry.validator)),
    ]),
  ];

  // The producer stops at quorum and only keeps the largest matching-root count,
  // not its signer identities. The complement is proven ONLY when the complete,
  // unique configured set is exhausted by that count and explicit failures for
  // this checkpoint index. Discovery/latest indices never establish membership.
  const membershipKnown =
    configured.length > 0 &&
    configured.every((address) => signerAddress(address) !== undefined) &&
    configuredSet.size === configured.length &&
    addresses.every((address) => configuredSet.has(address)) &&
    signatures?.index != null &&
    /^0x[\da-f]{64}$/i.test(signatures.root ?? '') &&
    signatures.collected != null &&
    signatures.collected > 0 &&
    signatures.collected === configuredSet.size - unavailable.size;

  return addresses.map((address) => {
    if (unavailable.has(address)) {
      return {
        address,
        status: 'unavailable',
        reason: checkpointReason(unavailable.get(address)),
      };
    }
    if (membershipKnown) return { address, status: 'collected' };
    return {
      address,
      status: 'unknown',
      ...(discovery.has(address) ? { reason: discoveryReason(discovery.get(address)) } : {}),
    };
  });
}

function checkpointReason(reason?: string | null): string {
  switch (reason) {
    case 'no_storage':
      return 'No usable validator storage';
    case 'missing':
      return 'Checkpoint not found in validator storage';
    case 'fetch_error':
      return 'Could not fetch checkpoint';
    case 'index_mismatch':
      return 'Fetched checkpoint has a different index';
    case 'invalid_signature':
      return 'Could not verify fetched signature';
    case 'signer_mismatch':
      return 'Fetched signature belongs to another signer';
    default:
      return 'Checkpoint unavailable';
  }
}

function discoveryReason(reason?: string | null): string {
  switch (reason) {
    case 'no_storage':
      return 'No usable validator storage';
    case 'missing':
      return 'Latest checkpoint index not found';
    case 'fetch_error':
      return 'Could not fetch latest checkpoint index';
    default:
      return 'Latest checkpoint discovery unavailable';
  }
}
