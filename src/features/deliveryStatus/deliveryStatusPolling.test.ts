import { shouldUseDeliveryStatusPolling } from './deliveryStatusPolling';

describe('shouldUseDeliveryStatusPolling', () => {
  it('polls PI messages while the websocket is connected', () => {
    expect(shouldUseDeliveryStatusPolling(true, 'connected')).toBe(true);
  });

  it('only polls scraped messages when the websocket is down', () => {
    expect(shouldUseDeliveryStatusPolling(false, 'connected')).toBe(false);
    expect(shouldUseDeliveryStatusPolling(false, 'connecting')).toBe(true);
    expect(shouldUseDeliveryStatusPolling(false, 'disconnected')).toBe(true);
    expect(shouldUseDeliveryStatusPolling(false, 'unavailable')).toBe(true);
  });
});
