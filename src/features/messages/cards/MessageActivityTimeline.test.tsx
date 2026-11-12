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

it('preserves grouped waits and distinguishes clock skew from missing times', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MessageActivityTimeline
          dispatchedAt={100_000}
          entries={[
            entry('signature', 99_000, {
              validator: '0x1111111111111111111111111111111111111111',
              summary: 'Merkle root multisig · checkpoint 103',
              signatureModule: '0xmodule',
            }),
            entry('dispatch', 100_000),
            entry('origin_confirmed', 100_500, { blockTimestamp: 100_500, timeSource: 'chain' }),
            entry('activity', 101_000, { repeatCount: 3, endTimestamp: 103_500 }),
            entry('delivery', 104_567),
            entry('validation'),
          ]}
        />,
      ),
    );
    const rows = container.querySelectorAll('ol[aria-label="Recorded message events"] > li');
    expect(rows[0].textContent).toContain('Before dispatch time');
    expect(rows[0].textContent).not.toContain('Observation not recorded');
    expect(rows[0].textContent).toContain('Merkle root multisig · checkpoint 103');
    expect(rows[0].querySelector('summary')?.textContent).not.toContain('0xmodule');
    await act(async () => {
      const details = rows[0].querySelector('details')!;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(rows[0].textContent).toContain(new Date(99_000).toISOString());
    expect(rows[0].textContent).toContain('ISM0xmodule');
    expect(rows[2].querySelector<HTMLTimeElement>('summary time')?.dateTime).toBe(
      new Date(100_500).toISOString(),
    );
    expect(rows[2].textContent).toContain('UTC');
    expect(rows[3].textContent).toContain('+3s since previous');
    expect(rows[4].textContent).toContain('+4.567s');
    expect(rows[4].textContent).toContain('+1.067s since previous');
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
