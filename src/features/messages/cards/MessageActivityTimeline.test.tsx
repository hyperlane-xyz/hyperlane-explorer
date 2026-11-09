/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { TimelineEntry } from '../diagnostics/activityTimeline';
import type { DiagnosticActivity } from '../diagnostics/types';
import { MessageActivityTimeline } from './MessageActivityTimeline';

jest.mock('@hyperlane-xyz/utils', () => ({ shortenAddress: (address: string) => address }));

const dispatchedAt = Date.UTC(2026, 10, 9, 16, 56, 40);
const reports: DiagnosticActivity[] = [
  {
    id: '10',
    relayer: 'main',
    observed_at: '2026-11-09T16:56:41.000123Z',
    received_at: '2026-11-09T16:56:41.100456Z',
    activity: {
      type: 'snapshot',
      state: {
        phase: 'retrying',
        modules: [],
        retry: { reason: 'CouldNotFetchMetadata', count: 1 },
      },
    },
  },
  {
    id: '11',
    relayer: 'main',
    observed_at: '2026-11-09T16:56:42.000345Z',
    activity: {
      type: 'snapshot_update',
      state: {
        phase: 'retrying',
        modules: [],
        retry: { reason: 'CouldNotFetchMetadata', count: 2 },
      },
    },
  },
  {
    id: '12',
    relayer: 'main',
    observed_at: '2026-11-09T16:56:43.500678Z',
    activity: {
      type: 'snapshot_update',
      state: {
        phase: 'retrying',
        modules: [],
        retry: { reason: 'CouldNotFetchMetadata', count: 3 },
      },
    },
  },
];

const entries: TimelineEntry[] = [
  {
    id: 'dispatch',
    kind: 'dispatch',
    title: 'Dispatched',
    detail: 'Origin block timestamp.',
    timestamp: dispatchedAt,
    timeSource: 'chain',
    status: 'complete',
    rows: [],
    repeatCount: 1,
  },
  {
    id: 'retries',
    kind: 'activity',
    title: 'Retrying',
    detail: 'Waiting for validator signatures.',
    timestamp: dispatchedAt + 1_000,
    timestampRaw: reports[0].observed_at,
    endTimestamp: dispatchedAt + 3_500,
    timeSource: 'relayer',
    status: 'complete',
    relayer: 'main',
    rows: reports,
    repeatCount: 3,
  },
  {
    id: 'signature',
    kind: 'signature',
    title: 'Signature collected',
    detail: 'The relayer observed this signature; the validator signing time is unavailable.',
    timestamp: dispatchedAt + 4_000,
    timeSource: 'relayer',
    status: 'complete',
    validator: '0xa59600000000000000000000000000000000bf03',
    rows: [],
    repeatCount: 1,
  },
  {
    id: 'delivery',
    kind: 'delivery',
    title: 'Delivered',
    detail: 'The relayer observed destination inclusion; the indexed message confirms execution.',
    timestamp: dispatchedAt + 4_567,
    blockTimestamp: dispatchedAt + 3_000,
    timeSource: 'relayer',
    status: 'complete',
    rows: [],
    repeatCount: 1,
  },
];

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Expected element was not rendered');
  return value;
}

function eventRow(container: HTMLElement, title: string) {
  return required(
    [...container.querySelectorAll('li')].find((row) =>
      row.querySelector('summary')?.textContent?.includes(title),
    ),
  );
}

async function toggle(details: HTMLDetailsElement, open = true) {
  await act(async () => {
    details.open = open;
    details.dispatchEvent(new Event('toggle'));
  });
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

it('shows cumulative and previous-activity intervals together, including time hidden in a repeated group', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<MessageActivityTimeline entries={entries} dispatchedAt={dispatchedAt} />),
    );
    expect(container.textContent).toContain('Since dispatch');
    expect(container.textContent).toContain('Since previous activity');
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('9 Nov 2026');
    const dispatch = eventRow(container, 'Dispatched');
    expect(dispatch.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-11-09T16:56:40.000Z',
    );
    expect(dispatch.textContent).toContain('Block time 9 Nov 2026 · 16:56:40.000 UTC');
    expect(dispatch.textContent).toContain('+0ms');
    expect(dispatch.textContent).not.toContain('since previous');

    const retries = eventRow(container, 'Retrying');
    expect(retries.textContent).toContain('+3.5s');
    expect(retries.textContent).toContain('+3.5s since previous');
    expect(
      retries.querySelector('[title="3,500 ms since dispatch at the last report in this group"]'),
    ).not.toBeNull();
    expect(
      retries.querySelector(
        '[title="3,500 ms since the previous activity; includes all reports in this group"]',
      ),
    ).not.toBeNull();

    const signature = eventRow(container, 'Signature collected');
    expect(signature.querySelector('time')).toBeNull();
    expect(signature.textContent).toContain('+4s');
    expect(signature.textContent).toContain('+500ms since previous');
    expect(signature.querySelector('[title="500 ms since the previous activity"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps repeated source reports collapsed and lazily reveals exact timestamps and raw data', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<MessageActivityTimeline entries={entries} dispatchedAt={dispatchedAt} />),
    );
    const retries = eventRow(container, 'Retrying');
    expect(retries.textContent).toContain('3 reports');
    expect(retries.textContent).not.toContain('#10');
    expect(retries.querySelector('pre')).toBeNull();

    const disclosure = required(retries.querySelector('details'));
    await toggle(disclosure);
    expect(retries.textContent).toContain('Repeated observations');
    expect(retries.textContent).toContain('Last report (UTC)');
    expect(retries.textContent).toContain('2026-11-09T16:56:43.500Z');
    expect(retries.textContent).toContain(reports[0].observed_at);
    expect(retries.textContent).toContain(reports[2].observed_at);
    expect(retries.textContent).not.toContain(reports[0].received_at);
    expect(retries.querySelectorAll('details details')).toHaveLength(3);
    expect(retries.querySelector('pre')).toBeNull();

    const source = required(retries.querySelector<HTMLDetailsElement>('details details'));
    await toggle(source);
    expect(retries.textContent).toContain(`Received by diagnostics: ${reports[0].received_at}`);
    expect(source.querySelector('pre')?.textContent).toContain('"reason": "CouldNotFetchMetadata"');
    expect(source.querySelector('pre')?.textContent).toContain('"count": 1');

    await toggle(disclosure, false);
    expect(retries.textContent).not.toContain('#10');
    expect(retries.querySelector('pre')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it('marks only the active step as current and busy, while untimed milestones retain unknown timing', async () => {
  const activeEntries: TimelineEntry[] = [
    {
      id: 'validation',
      kind: 'validation',
      title: 'Validation passed',
      detail: 'Security module requirements satisfied.',
      timestamp: dispatchedAt + 1_000,
      timeSource: 'relayer',
      status: 'complete',
      rows: [],
      repeatCount: 1,
    },
    {
      id: 'submission',
      kind: 'submission',
      title: 'Submitting',
      detail: 'Waiting for transaction inclusion.',
      timestamp: dispatchedAt + 2_000,
      timeSource: 'relayer',
      status: 'active',
      rows: [],
      repeatCount: 1,
    },
    {
      id: 'pickup',
      kind: 'pickup',
      title: 'Picked up by relayer',
      detail: 'The first observation timestamp was not recorded.',
      status: 'complete',
      rows: [],
      repeatCount: 1,
    },
  ];
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<MessageActivityTimeline entries={activeEntries} dispatchedAt={dispatchedAt} />),
    );
    const submitting = eventRow(container, 'Submitting');
    expect(submitting.getAttribute('aria-current')).toBe('step');
    expect(submitting.getAttribute('aria-busy')).toBe('true');
    expect(submitting.textContent).toContain('In progress');
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(eventRow(container, 'Validation passed').textContent).not.toContain('In progress');

    const untimed = required(
      container.querySelector('ol[aria-label="Milestones without recorded timestamps"]'),
    );
    expect(untimed.textContent).toContain('Picked up by relayer');
    expect(untimed.textContent).toContain('Observation not recorded');
    expect(untimed.querySelector('time')).toBeNull();
    expect(untimed.textContent).not.toContain('+');
  } finally {
    await act(async () => root.unmount());
  }
});

it('uses observed inclusion for delivery intervals and reveals the separate block timestamp on expansion', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<MessageActivityTimeline entries={entries} dispatchedAt={dispatchedAt} />),
    );
    const delivery = eventRow(container, 'Delivered');
    expect(delivery.textContent).toContain('+4.567s');
    expect(delivery.textContent).toContain('+567ms since previous');
    expect(delivery.querySelector('time')).toBeNull();
    expect(delivery.textContent).not.toContain('16:56:44.567');
    expect(delivery.textContent).not.toContain('16:56:43.000');

    await toggle(required(delivery.querySelector('details')));
    expect(delivery.textContent).toContain('Observed at (UTC)');
    expect(delivery.textContent).toContain('2026-11-09T16:56:44.567Z');
    expect(delivery.textContent).toContain('Block timestamp (UTC)');
    expect(delivery.textContent).toContain('2026-11-09T16:56:43.000Z');
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps an untimed delivery inline before a later relayer report without inventing elapsed time', async () => {
  const anchoredEntries: TimelineEntry[] = [
    {
      id: 'dispatch',
      kind: 'dispatch',
      title: 'Dispatched',
      detail: 'Origin block timestamp.',
      timestamp: dispatchedAt,
      timeSource: 'chain',
      status: 'complete',
      rows: [],
      repeatCount: 1,
    },
    {
      id: 'delivery',
      kind: 'delivery',
      title: 'Delivered',
      detail: 'Execution is confirmed, but its observation time was not recorded.',
      orderTimestamp: dispatchedAt + 5_000,
      status: 'complete',
      rows: [],
      repeatCount: 1,
    },
    {
      id: 'delivery-recheck',
      kind: 'activity',
      title: 'Delivery rechecked',
      detail: 'The relayer rechecked the destination mailbox.',
      timestamp: dispatchedAt + 600_000,
      timeSource: 'relayer',
      status: 'complete',
      rows: [
        {
          id: '20',
          relayer: 'main',
          observed_at: '2026-11-09T17:06:40.000Z',
          activity: {
            type: 'snapshot_update',
            state: { phase: 'delivered', modules: [] },
          },
        },
      ],
      repeatCount: 1,
    },
  ];
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MessageActivityTimeline entries={anchoredEntries} dispatchedAt={dispatchedAt} />,
      ),
    );
    const recorded = required(container.querySelector('ol[aria-label="Recorded message events"]'));
    const rows = [...recorded.querySelectorAll('li')];
    expect(rows).toEqual([
      eventRow(container, 'Dispatched'),
      eventRow(container, 'Delivered'),
      eventRow(container, 'Delivery rechecked'),
    ]);
    expect(
      container.querySelector('ol[aria-label="Milestones without recorded timestamps"]'),
    ).toBeNull();

    const delivery = eventRow(container, 'Delivered');
    expect(delivery.textContent).toContain('Observation not recorded');
    expect(delivery.querySelector('time')).toBeNull();
    expect(delivery.textContent).not.toContain('+');
    expect(delivery.textContent).not.toContain('since previous');
    await toggle(required(delivery.querySelector('details')));
    expect(delivery.textContent).not.toContain('2026-11-09T16:56:45.000Z');
    expect(delivery.textContent).not.toContain('Observed at (UTC)');

    const recheck = eventRow(container, 'Delivery rechecked');
    expect(recheck.textContent).toContain('+10m');
    expect(recheck.textContent).toContain('Destination mailbox rechecked by relayer');
    expect(recheck.textContent).not.toContain('since previous');
    expect(recheck.querySelector('time')).toBeNull();
    await toggle(required(recheck.querySelector('details')));
    expect(recheck.textContent).toContain('Observed at (UTC)');
    expect(recheck.textContent).toContain('2026-11-09T17:06:40.000Z');
  } finally {
    await act(async () => root.unmount());
  }
});
