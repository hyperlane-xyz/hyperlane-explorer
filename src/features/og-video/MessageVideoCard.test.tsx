import { renderToStaticMarkup } from 'react-dom/server';

import { MessageVideoCard, type VideoMessage } from './MessageVideoCard';

const message: VideoMessage = {
  msgId: '0x' + 'ab'.repeat(32),
  status: 'Delivered',
  timestamp: Date.UTC(2026, 9, 24, 12, 30),
  deliveryLatency: '00:01:12',
  origin: { name: 'Arbitrum', logo: '/arbitrum.svg' },
  destination: { name: 'Optimism', logo: '/optimism.svg' },
  transfer: { amount: '42.50', symbol: 'USDT' },
};

function render(data: VideoMessage, time: number) {
  return renderToStaticMarkup(<MessageVideoCard message={data} time={time} logo="/logo.svg" />);
}

describe('MessageVideoCard', () => {
  it('renders the actual route, amount, timing and message ID rather than example data', () => {
    const markup = render(message, 5);
    expect(markup).toContain('Arbitrum');
    expect(markup).toContain('Optimism');
    expect(markup).toContain('42.50');
    expect(markup).toContain('USDT');
    expect(markup).toContain('00:01:12');
    expect(markup).toContain('0xabababab...abababab');
    expect(markup).toContain('2026-10-24 12:30 UTC');
    expect(markup).not.toContain('1,250');
    expect(markup).not.toContain('ILLUSTRATIVE');
    expect(markup).toContain('RECEIVED AT DESTINATION');
  });

  it('labels an already-delivered message as a replay before it reaches the destination', () => {
    const markup = render(message, 0);
    expect(markup).toContain('Delivered');
    expect(markup).toContain('MESSAGE REPLAY');
    expect(markup).not.toContain('RECEIVED AT DESTINATION');
  });

  it.each([0, 2.5, 4.9])('never implies success for a pending message at %s seconds', (time) => {
    const markup = render({ ...message, status: 'Pending', deliveryLatency: null }, time);
    expect(markup).toContain('Pending');
    expect(markup).toContain('AWAITING DELIVERY');
    expect(markup).not.toContain('RECEIVED');
    expect(markup).not.toContain('#53e6ad');
    expect(markup).not.toContain('00:01:12');
  });

  it('does not invent token details for an arbitrary interchain message', () => {
    const markup = render({ ...message, transfer: null, deliveryLatency: null }, 5);
    expect(markup).toContain('Interchain message');
    expect(markup).not.toContain('USDT');
    expect(markup).not.toContain('00:01:12');
  });

  it('keeps unknown delivery status distinct from pending and delivered', () => {
    const markup = render(
      { ...message, status: 'Unknown', transfer: null, deliveryLatency: null },
      5,
    );
    expect(markup).toContain('STATUS UNAVAILABLE');
    expect(markup).not.toContain('AWAITING DELIVERY');
    expect(markup).not.toContain('RECEIVED');
  });
});
