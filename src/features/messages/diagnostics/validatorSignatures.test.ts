import { diagnosticModuleSchema } from './types';
import { getValidatorSignatures, signatureLocationUrl } from './validatorSignatures';

const a = `0x${'aa'.repeat(20)}`;
const b = `0x${'bb'.repeat(20)}`;
const c = `0x${'cc'.repeat(20)}`;
const padded = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`;
const root = `0x${'11'.repeat(32)}`;
function node(overrides: Record<string, unknown> = {}) {
  return diagnosticModuleSchema.parse({
    ism: 'program',
    node_id: 'node',
    validators: [padded(a), padded(b), padded(c)],
    signatures: { index: 8, root, threshold: 2, collected: 2, signers: [] },
    ...overrides,
  });
}

test('uses the exact reported signer identities and locations', () => {
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: 8,
          root,
          threshold: 2,
          collected: 2,
          signers: [
            { validator: padded(b), location: 's3://validator-b/checkpoints' },
            { validator: padded(c), location: null },
          ],
          unavailable: [{ validator: padded(a), reason: 'missing' }],
        },
      }),
    ),
  ).toEqual([
    { address: a, status: 'unavailable', reason: 'Checkpoint not found in validator storage' },
    { address: b, status: 'collected', location: 's3://validator-b/checkpoints' },
    { address: c, status: 'collected' },
  ]);
});

test('never infers signer identities from counts', () => {
  expect(
    getValidatorSignatures(
      node({ signatures: { index: 8, root, threshold: 3, collected: 3, signers: [] } }),
    ).map((entry) => entry.status),
  ).toEqual(['unknown', 'unknown', 'unknown']);
});

test('normalizes EVM signer identities without truncating other program keys', () => {
  const programKey = `0x${'dd'.repeat(32)}`;
  expect(
    getValidatorSignatures(
      node({
        validators: [padded(a), programKey],
        signatures: {
          signers: [
            { validator: a.toUpperCase(), location: 'gs://validator-a/checkpoints' },
            { validator: programKey, location: 'https://example.com/checkpoints' },
          ],
        },
      }),
    ),
  ).toEqual([
    { address: a, status: 'collected', location: 'gs://validator-a/checkpoints' },
    { address: programKey, status: 'collected', location: 'https://example.com/checkpoints' },
  ]);
});

test('keeps unsigned and unavailable validators explicit', () => {
  const entries = getValidatorSignatures(
    node({
      signatures: {
        signers: [{ validator: padded(a), location: null }],
        unavailable: [{ validator: padded(b), reason: 'fetch_error' }],
        discovery_unavailable: [{ validator: padded(c), reason: 'missing' }],
      },
    }),
  );
  expect(entries).toEqual([
    { address: a, status: 'collected' },
    { address: b, status: 'unavailable', reason: 'Could not fetch checkpoint' },
    { address: c, status: 'unknown', reason: 'Latest checkpoint index not found' },
  ]);
});

test('links only public signature locations', () => {
  for (const location of [
    'https://example.com/checkpoints',
    'http://example.com/checkpoints',
    's3://validator/checkpoints',
    'gs://validator/checkpoints',
  ])
    expect(signatureLocationUrl(location)).toBe(location);
  for (const location of ['local', 'javascript:alert(1)', 'not a URL', undefined])
    expect(signatureLocationUrl(location)).toBeUndefined();
});

test('does not treat latest checkpoint discovery as a signature', () => {
  expect(
    getValidatorSignatures(
      node({
        validators: [a, b, c],
        signatures: {
          signers: [],
          latest_indices: [
            { validator: padded(a), index: 0 },
            { validator: b, index: 12 },
            { validator: c, index: null },
          ],
        },
      }),
    ),
  ).toEqual([
    { address: a, status: 'unknown', latestIndex: 0 },
    { address: b, status: 'unknown', latestIndex: 12 },
    { address: c, status: 'unknown' },
  ]);
});
