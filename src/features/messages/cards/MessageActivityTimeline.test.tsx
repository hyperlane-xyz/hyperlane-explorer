/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

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

it('uses the signature success color and checkmark for successful CCIP reads', () => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <MessageActivityTimeline
      dispatchedAt={100_000}
      entries={[
        entry('signature', 101_000),
        entry('offchain_read', 102_000),
        entry('offchain_read', 103_000, { id: 'pending', status: 'pending' }),
        entry('offchain_read', 104_000, { id: 'failed', status: 'failed' }),
      ]}
    />,
  );
  const [signature, proof, pending, failed] = container.querySelectorAll('li');
  const checkmark = signature.querySelector('path')!.getAttribute('d');
  expect(proof.querySelector('path')!.getAttribute('d')).toBe(checkmark);
  expect(proof.querySelector('summary .text-green-800')).toBeTruthy();
  for (const row of [pending, failed]) {
    expect(row.querySelector('path')!.getAttribute('d')).not.toBe(checkmark);
    expect(row.querySelector('summary .text-green-800')).toBeNull();
  }
});

it('expands the CCIP response into labeled fields with the full URL and proof hash', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const url = 'https://gateway.example/ccip/{sender}/{data}';
  const hash = `0x${'abcdef01'.repeat(8)}`;
  try {
    await act(async () =>
      root.render(
        <MessageActivityTimeline
          dispatchedAt={100_000}
          entries={[
            entry('offchain_read', 101_000, {
              title: 'Proof data received and decoded',
              summary: 'gateway.example · Attempt 1 · HTTP 200 · 128 bytes',
              relayer: 'hyperlane',
              ism: '0x1111111111111111111111111111111111111111',
              offchainRead: {
                state: 'succeeded',
                hostname: 'gateway.example',
                endpoint: 0,
                attempt: 1,
                http_status: 200,
                url_template: url,
                result: { bytes: 128, keccak256: hash },
              },
            }),
          ]}
        />,
      ),
    );
    const details = container.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const fields = details.querySelectorAll('dl[aria-label="CCIP Read details"] dt');
    expect(
      Object.fromEntries(
        [...fields].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]),
      ),
    ).toEqual({
      Gateway: 'gateway.example',
      Endpoint: '1',
      Attempt: '1',
      'HTTP status': '200',
      'Proof size': '128 bytes',
      'Gateway URL template': url,
      'Proof hash (Keccak-256)': hash,
    });
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});

it('expands one reorg activity to show each validator and its result', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const validators = [
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
  ];
  try {
    await act(async () =>
      root.render(
        <MessageActivityTimeline
          dispatchedAt={100_000}
          entries={[
            entry('security', 101_000, {
              title: 'Reorg checks passed',
              summary: '2 validators checked',
              reorgResults: validators.map((validator) => ({
                validator,
                result: 'No reorg reported',
              })),
            }),
          ]}
        />,
      ),
    );
    expect(container.querySelector('summary')?.textContent).toContain('2 validators checked');
    const details = container.querySelector('details')!;
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const results = container.querySelector('dl[aria-label="Validator reorg results"]')!;
    expect([...results.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(validators);
    expect([...results.querySelectorAll('dd')].map((value) => value.textContent)).toEqual([
      'No reorg reported',
      'No reorg reported',
    ]);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});

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
              ism: '0xmodule',
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
