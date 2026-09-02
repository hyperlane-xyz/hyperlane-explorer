import { IsmType } from '@hyperlane-xyz/sdk';

import {
  IsmTraversalGuard,
  assertSelfRelayIsmSupported,
  isUnsupportedSelfRelayIsm,
} from './boundedIsmReader';

const ADDRESS_A = '0x1111111111111111111111111111111111111111';
const ADDRESS_B = '0x2222222222222222222222222222222222222222';
const ADDRESS_C = '0x3333333333333333333333333333333333333333';

function createGuard(overrides: Partial<ConstructorParameters<typeof IsmTraversalGuard>[0]> = {}) {
  return new IsmTraversalGuard({
    maxDepth: 3,
    maxFanout: 2,
    maxModules: 4,
    maxValidators: 3,
    deadline: Date.now() + 1_000,
    ...overrides,
  });
}

describe('IsmTraversalGuard', () => {
  it('rejects a self-referential ISM', async () => {
    const guard = createGuard();

    await expect(
      guard.visit(ADDRESS_A, () => guard.visit(ADDRESS_A, async () => undefined)),
    ).rejects.toThrow('contains a cycle');
  });

  it('rejects an ISM graph beyond the depth bound', async () => {
    const guard = createGuard();

    await expect(
      guard.visit(ADDRESS_A, () =>
        guard.visit(ADDRESS_B, () =>
          guard.visit(ADDRESS_C, () =>
            guard.visit('0x4444444444444444444444444444444444444444', async () => undefined),
          ),
        ),
      ),
    ).rejects.toThrow('exceeds depth 3');
  });

  it('rejects aggregation fanout beyond the bound', () => {
    const guard = createGuard();

    expect(() => guard.assertFanout(3)).toThrow('exceeds fanout 2');
  });

  it('rejects a graph beyond the total module bound', async () => {
    const guard = createGuard({ maxDepth: 10, maxModules: 2 });

    await guard.visit(ADDRESS_A, async () => undefined);
    await guard.visit(ADDRESS_B, async () => undefined);
    await expect(guard.visit(ADDRESS_C, async () => undefined)).rejects.toThrow(
      'exceeds 2 modules',
    );
  });

  it('caps and deduplicates multisig validators', () => {
    const guard = createGuard();

    expect(guard.normalizeValidators([ADDRESS_A, ADDRESS_A, ADDRESS_B], 2)).toEqual([
      ADDRESS_A,
      ADDRESS_B,
    ]);
    expect(() =>
      guard.normalizeValidators([ADDRESS_A, ADDRESS_B, ADDRESS_C, ADDRESS_A], 2),
    ).toThrow('exceeds 3 validators');
  });

  it('rejects a threshold above the unique validator count', () => {
    const guard = createGuard();

    expect(() => guard.normalizeValidators([ADDRESS_A, ADDRESS_A], 2)).toThrow(
      'exceeds 1 unique validators',
    );
  });
});

describe('assertSelfRelayIsmSupported', () => {
  it('accepts supported nested aggregation modules', () => {
    expect(() =>
      assertSelfRelayIsmSupported({
        type: IsmType.AGGREGATION,
        threshold: 1,
        modules: [
          {
            type: IsmType.MESSAGE_ID_MULTISIG,
            validators: [ADDRESS_A],
            threshold: 1,
          },
        ],
      }),
    ).not.toThrow();
  });

  it.each([IsmType.TRUSTED_RELAYER, IsmType.ARB_L2_TO_L1, IsmType.MERKLE_ROOT_MULTISIG])(
    'rejects unsupported %s modules',
    (type) => {
      expect(() => assertSelfRelayIsmSupported({ type })).toThrow('not supported');
    },
  );

  it('rejects unsupported modules nested in an aggregation', () => {
    try {
      assertSelfRelayIsmSupported({
        type: IsmType.AGGREGATION,
        threshold: 1,
        modules: [{ type: IsmType.TRUSTED_RELAYER, relayer: ADDRESS_A }],
      });
      throw new Error('Expected unsupported ISM rejection');
    } catch (error) {
      expect(isUnsupportedSelfRelayIsm(error)).toBe(true);
    }
  });
});
