import { renderToStaticMarkup } from 'react-dom/server';

import { MessageVideoCard } from './MessageVideoCard';

describe('MessageVideoCard', () => {
  it('shows a delivered replay arriving without changing the recorded status', () => {
    const start = renderToStaticMarkup(
      <MessageVideoCard status="delivered" time={0} logo="/logo.svg" />,
    );
    const end = renderToStaticMarkup(
      <MessageVideoCard status="delivered" time={4.9} logo="/logo.svg" />,
    );
    expect(start).toContain('Delivered');
    expect(start).toContain('MESSAGE REPLAY');
    expect(end).toContain('RECEIVED ON ETHEREUM');
    expect(end).toContain('24 seconds');
    expect(end).toContain('ILLUSTRATIVE TRANSFER');
  });

  it.each([0, 2.5, 4.9])(
    'never implies receipt or success for a pending message at %s seconds',
    (time) => {
      const markup = renderToStaticMarkup(
        <MessageVideoCard status="pending" time={time} logo="/logo.svg" />,
      );
      expect(markup).toContain('Pending');
      expect(markup).toContain('AWAITING DELIVERY');
      expect(markup).not.toContain('RECEIVED');
      expect(markup).not.toContain('#53e6ad');
      expect(markup).not.toContain('24 seconds');
    },
  );
});
