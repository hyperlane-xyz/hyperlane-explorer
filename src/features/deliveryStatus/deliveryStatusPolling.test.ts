import { getDeliveryStatusRefetchInterval } from './deliveryStatusPolling';

it.each([
  [false, true, 'connected', 10_000],
  [false, false, 'connected', false],
  [false, false, 'connecting', 10_000],
  [false, false, 'disconnected', 10_000],
  [false, undefined, 'unavailable', 10_000],
  [true, true, 'connected', false],
  [true, false, 'disconnected', false],
] as const)(
  'delivery polling: delivered=%s, PI=%s, connection=%s',
  (delivered, pi, state, interval) => {
    expect(getDeliveryStatusRefetchInterval(delivered, pi, state)).toBe(interval);
  },
);
