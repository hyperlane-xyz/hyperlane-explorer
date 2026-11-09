import type { DiagnosticModule } from './types';

export interface ValidatorSignature {
  address: string;
  status: 'collected' | 'unavailable' | 'unknown';
  location?: string;
  reason?: string;
}

// Validator checkpoint signers use EVM addresses, independently of the ISM program's VM.
function signerAddress(value: string): string | undefined {
  if (/^0x[\da-f]{40}$/i.test(value)) return value.toLowerCase();
  if (/^0x0{24}[\da-f]{40}$/i.test(value)) return `0x${value.slice(-40).toLowerCase()}`;
  return undefined;
}

export function signatureLocationUrl(location?: string): string | undefined {
  if (!location || location === 'local') return undefined;
  try {
    const protocol = new URL(location).protocol;
    return ['https:', 'http:', 's3:', 'gs:'].includes(protocol) ? location : undefined;
  } catch {
    return undefined;
  }
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
  const signers = new Map(
    (signatures?.signers ?? []).map((entry) => [key(entry.validator), entry.location ?? undefined]),
  );
  const addresses = [
    ...new Set([
      ...configured.map(key),
      ...signers.keys(),
      ...unavailable.keys(),
      ...discovery.keys(),
      ...(signatures?.latest_indices ?? []).map((entry) => key(entry.validator)),
    ]),
  ];

  return addresses.map((address) => {
    if (signers.has(address)) {
      return {
        address,
        status: 'collected',
        ...(signers.get(address) ? { location: signers.get(address) } : {}),
      };
    }
    if (unavailable.has(address)) {
      return {
        address,
        status: 'unavailable',
        reason: checkpointReason(unavailable.get(address)),
      };
    }
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
