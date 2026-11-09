import {
  estimateConfirmationSeconds,
  estimateDeliverySeconds,
  formatEstimatedTime,
} from './deliveryEstimate';

const blocks = { confirmations: 2, reorgPeriod: 15, estimateBlockTime: 12 };

test('uses configured origin maturity and remaining confirmations like Nexus', () => {
  expect(estimateDeliverySeconds(blocks)).toBe(185);
  expect(estimateDeliverySeconds(blocks, { confirmed: false, required: 15, current: 5 })).toBe(125);
  expect(estimateDeliverySeconds(blocks, { confirmed: false, required: 15, current: 15 })).toBe(5);
  expect(estimateDeliverySeconds(blocks, { confirmed: true })).toBe(5);
  expect(
    estimateDeliverySeconds(blocks, { confirmed: false, required: 15, current: 1 }, true),
  ).toBe(5);
  expect(estimateDeliverySeconds({ confirmations: 0, estimateBlockTime: 0.4 })).toBe(5);
  expect(
    estimateDeliverySeconds({ confirmations: 2, reorgPeriod: 'safe', estimateBlockTime: 0.5 }),
  ).toBe(6);
});

test('estimates confirmations only with a known count and policy', () => {
  expect(estimateConfirmationSeconds({ confirmed: false, current: 2, required: 5 }, 0.25)).toBe(
    0.75,
  );
  expect(estimateConfirmationSeconds({ confirmed: false, current: 5, required: 5 }, 12)).toBe(0);
  expect(
    estimateConfirmationSeconds({ confirmed: false, current: null, required: 5 }, 12),
  ).toBeUndefined();
  expect(estimateConfirmationSeconds({ confirmed: false, current: 2 }, 12)).toBeUndefined();
  expect(
    estimateConfirmationSeconds({ confirmed: true, current: 5, required: 5 }, 12),
  ).toBeUndefined();
});

test('does not invent estimates for missing or invalid metadata and counts', () => {
  expect(estimateDeliverySeconds(undefined)).toBeUndefined();
  for (const estimateBlockTime of [undefined, 0, -1, NaN, Infinity]) {
    expect(estimateDeliverySeconds({ ...blocks, estimateBlockTime })).toBeUndefined();
    expect(
      estimateConfirmationSeconds({ confirmed: false, current: 1, required: 5 }, estimateBlockTime),
    ).toBeUndefined();
  }
  for (const value of [-1, NaN, Infinity]) {
    expect(estimateDeliverySeconds({ ...blocks, reorgPeriod: value })).toBeUndefined();
    expect(
      estimateConfirmationSeconds({ confirmed: false, current: value, required: 5 }, 12),
    ).toBeUndefined();
  }
});

test('matches Nexus rounding without fractional minute or hour estimates', () => {
  expect(formatEstimatedTime(4.1)).toBe('~5s');
  expect(formatEstimatedTime(59.5)).toBe('~60s');
  expect(formatEstimatedTime(119.9)).toBe('~1 min');
  expect(formatEstimatedTime(185)).toBe('~3 min');
  expect(formatEstimatedTime(3599)).toBe('~59 min');
  expect(formatEstimatedTime(3601)).toBe('~1 hr');
  expect(() => formatEstimatedTime(NaN)).toThrow('Invalid estimated duration');
});
