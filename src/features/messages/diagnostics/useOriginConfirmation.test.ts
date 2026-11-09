import { MessageStatus } from '../../../types';
import { getOriginConfirmation } from './useOriginConfirmation';

const message = { origin: { hash: 'dispatch', blockNumber: 100, timestamp: 1_000 } };
const blocks = { confirmations: 2, reorgPeriod: 5, estimateBlockTime: 12 };

test('targets the actual maturity height, using reorgPeriod rather than an estimated time', () => {
  expect(getOriginConfirmation(message, blocks, 104)).toEqual({
    blockNumber: 105,
    required: 5,
    current: 4,
    confirmed: false,
    tracked: true,
    timestamp: undefined,
  });
  expect(getOriginConfirmation(message, blocks, 105)).toMatchObject({
    confirmed: true,
    current: 5,
    timestamp: undefined,
  });
  expect(getOriginConfirmation(message, { confirmations: 2 }, 102)).toMatchObject({
    blockNumber: 102,
    required: 2,
    confirmed: true,
  });
});

test('canonical origin flags override both a stale head and fast-path delivery', () => {
  const delivered = { ...message, status: MessageStatus.Delivered, isOriginProvisional: true };
  expect(getOriginConfirmation(delivered, blocks, 110).confirmed).toBe(false);
  expect(
    getOriginConfirmation(
      { ...message, isOriginProvisional: false, isProvisional: true },
      blocks,
      101,
    ),
  ).toMatchObject({ confirmed: true, tracked: true, current: 5 });
  expect(getOriginConfirmation({ ...message, isProvisional: false }, blocks).confirmed).toBe(true);
});

test('zero depth uses dispatch time without an RPC lookup, but respects provisional state', () => {
  expect(getOriginConfirmation(message, { confirmations: 0 })).toMatchObject({
    blockNumber: 100,
    required: 0,
    confirmed: true,
    timestamp: 1_000,
  });
  expect(
    getOriginConfirmation({ ...message, isOriginProvisional: true }, { confirmations: 0 }),
  ).toMatchObject({ confirmed: false, timestamp: undefined });
});

test.each(['safe', 'finalized'])(
  '%s keeps canonical status without inventing a height or time',
  (tag) => {
    expect(
      getOriginConfirmation(
        { ...message, isOriginProvisional: false },
        { confirmations: 5, reorgPeriod: tag },
        200,
      ),
    ).toEqual({
      blockNumber: undefined,
      required: undefined,
      current: undefined,
      confirmed: true,
      tracked: true,
      timestamp: undefined,
    });
  },
);

test('missing tracking evidence remains unknown for any VM', () => {
  expect(getOriginConfirmation(message, blocks)).toMatchObject({
    confirmed: false,
    tracked: false,
  });
  expect(getOriginConfirmation(message)).toMatchObject({ confirmed: false, tracked: false });
  expect(getOriginConfirmation({ ...message, isOriginProvisional: true })).toMatchObject({
    confirmed: false,
    tracked: true,
  });
});
