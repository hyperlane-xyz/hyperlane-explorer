/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { TimelineEntry } from '../diagnostics/activityTimeline';
import { MessageActivityTimeline } from './MessageActivityTimeline';

jest.mock('@hyperlane-xyz/utils', () => ({ shortenAddress: (address: string) => address }));

function entry(
  kind: TimelineEntry['kind'],
  timestamp?: number,
  extra: Partial<TimelineEntry> = {},
): TimelineEntry {
  return {
    id: kind,
    kind,
    title: kind,
    detail: '',
    status: 'complete',
    rows: [],
    repeatCount: 1,
    timestamp,
    ...extra,
  };
}

it('includes the full grouped wait in elapsed intervals and leaves missing times unknown', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MessageActivityTimeline
          dispatchedAt={100_000}
          entries={[
            entry('dispatch', 100_000),
            entry('activity', 101_000, { repeatCount: 3, endTimestamp: 103_500 }),
            entry('delivery', 104_567),
            entry('validation'),
          ]}
        />,
      ),
    );
    const rows = container.querySelectorAll('ol[aria-label="Recorded message events"] > li');
    expect(rows[1].textContent).toContain('+3.5s since previous');
    expect(rows[2].textContent).toContain('+4.567s');
    expect(rows[2].textContent).toContain('+1.067s since previous');
    const untimed = container.querySelector(
      'ol[aria-label="Milestones without recorded timestamps"]',
    );
    expect(untimed?.textContent).toContain('Observation not recorded');
    expect(untimed?.textContent).not.toContain('+');
    expect(untimed?.querySelector('time')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
