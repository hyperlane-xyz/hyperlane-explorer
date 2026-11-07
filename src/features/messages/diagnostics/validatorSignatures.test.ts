import { diagnosticModuleSchema } from './types';
import { getValidatorSignatures } from './validatorSignatures';

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
    signatures: { index: 8, root, threshold: 2, collected: 2 },
    ...overrides,
  });
}

test('threshold counts and advertised indices do not identify individual signers', () => {
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: 8,
          root,
          threshold: 2,
          collected: 2,
          latest_indices: [
            { validator: a, index: 9 },
            { validator: b, index: 8 },
          ],
        },
      }),
    ),
  ).toEqual([a, b, c].map((address) => ({ address, status: 'unknown' })));
});

test('infers signers only when one matching-root count exhausts the configured remainder', () => {
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: 8,
          root,
          threshold: 2,
          collected: 2,
          unavailable: [{ validator: padded(c), reason: 'fetch_error' }],
        },
      }),
    ),
  ).toEqual([
    { address: a, status: 'collected' },
    { address: b, status: 'collected' },
    { address: c, status: 'unavailable', reason: 'Could not fetch checkpoint' },
  ]);
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: 8,
          root,
          threshold: 3,
          collected: 3,
        },
      }),
    ).every((entry) => entry.status === 'collected'),
  ).toBe(true);
});

test('conflicting-root or incomplete fetches cannot turn unreported validators green', () => {
  const entries = getValidatorSignatures(
    node({
      signatures: {
        index: 8,
        root,
        threshold: 2,
        collected: 1,
        unavailable: [{ validator: c, reason: 'missing' }],
      },
    }),
  );
  expect(entries.map((entry) => entry.status)).toEqual(['unknown', 'unknown', 'unavailable']);
  expect(entries[2].reason).toBe('Checkpoint not found in validator storage');
});

test('discovery failures do not contradict fetched signatures or imply unsigned checkpoints', () => {
  const discovery_unavailable = [{ validator: padded(a), reason: 'fetch_error' }];
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: 8,
          root,
          threshold: 3,
          collected: 3,
          discovery_unavailable,
        },
      }),
    )[0],
  ).toEqual({ address: a, status: 'collected' });
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: 8,
          root,
          threshold: 2,
          collected: 2,
          discovery_unavailable,
        },
      }),
    )[0],
  ).toEqual({ address: a, status: 'unknown', reason: 'Could not fetch latest checkpoint index' });
});

test('normalizes EVM bytes20/bytes32 identities and never truncates non-padded program keys', () => {
  const invalid = `0x${'dd'.repeat(32)}`;
  const entries = getValidatorSignatures(
    node({
      validators: [a.toUpperCase(), padded(a), invalid],
      signatures: {
        index: 8,
        root,
        collected: 3,
        unavailable: [{ validator: padded(a), reason: 'missing' }],
      },
    }),
  );
  expect(entries.map((entry) => entry.address)).toEqual([a, invalid]);
  expect(entries.map((entry) => entry.status)).toEqual(['unavailable', 'unknown']);
});

test('missing/null partial fields retain reported identities without invented membership', () => {
  expect(getValidatorSignatures(node({ validators: null, signatures: null }))).toEqual([]);
  expect(
    getValidatorSignatures(
      node({
        signatures: {
          index: null,
          root: null,
          collected: null,
          threshold: null,
          unavailable: null,
          latest_indices: null,
          discovery_unavailable: null,
        },
      }),
    ).map((entry) => entry.status),
  ).toEqual(['unknown', 'unknown', 'unknown']);
  expect(
    getValidatorSignatures(
      node({
        validators: null,
        signatures: {
          unavailable: [{ validator: padded(a), reason: null }],
        },
      }),
    ),
  ).toEqual([{ address: a, status: 'unavailable', reason: 'Checkpoint unavailable' }]);
});

test('inconsistent sets, missing roots, and duplicate validators cannot prove membership', () => {
  for (const value of [
    node({
      validators: [a, b],
      signatures: {
        index: 8,
        root,
        collected: 2,
        unavailable: [{ validator: c, reason: 'missing' }],
      },
    }),
    node({ signatures: { index: 8, root: null, collected: 3 } }),
    node({ validators: [a, padded(a), b], signatures: { index: 8, root, collected: 3 } }),
  ])
    expect(getValidatorSignatures(value).some((entry) => entry.status === 'collected')).toBe(false);
});
