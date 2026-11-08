/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DiagnosticActivity } from '../diagnostics/types';
import type { useMessageActivityPage } from '../diagnostics/useMessageDiagnostics';
import { MessageActivityLog } from './MessageActivityLog';

jest.mock('@hyperlane-xyz/utils', () => ({ shortenAddress: (value: string) => value }));
jest.mock('@hyperlane-xyz/widgets', () => ({ CopyButton: () => null }));

const row = (id: string, timestamp: number, phase: string): DiagnosticActivity => ({
  id,
  relayer: `0x${'11'.repeat(20)}`,
  observed_at: new Date(timestamp).toISOString(),
  activity: { type: 'snapshot', state: { phase, modules: [] } },
});
const history = (
  activities: DiagnosticActivity[],
  page = 0,
): ReturnType<typeof useMessageActivityPage> => ({
  activityPage: { message_id: 'message', has_more: false, next_before_id: null, activities },
  loadedActivities: [],
  page,
  fetching: false,
  error: undefined,
  next: jest.fn(),
  previous: jest.fn(),
  latest: jest.fn(),
});

it('retains an older page timing independently of the bounded history cache', () => {
  const html = renderToStaticMarkup(
    <MessageActivityLog
      header={null}
      history={history([row('1', 2000, 'preparing')], 21)}
      dispatchedAt={1000}
    />,
  );
  expect(html).toContain('Preparing');
  expect(html).toContain('1s');
  expect(html).toContain('Earlier activity');
});

it('orders observations chronologically without extending on-chain delivery by late reports', () => {
  const html = renderToStaticMarkup(
    <MessageActivityLog
      header={null}
      history={history([row('2', 781000, 'delivered'), row('1', 2000, 'preparing')])}
      dispatchedAt={1000}
      deliveredAt={181000}
    />,
  );
  expect(html).toContain('+13m');
  expect(html).toContain('Reported 10m after delivery');
  expect(html).not.toContain('Previous loaded');
  expect(html.indexOf('Preparing')).toBeLessThan(html.indexOf('Relayer confirmed delivery'));
  const summaries = html.match(/<summary\b[^>]*>[\s\S]*?<\/summary>/g) ?? [];
  expect(summaries).toHaveLength(4);
  expect(summaries[2]).toContain('Relayer confirmed delivery');
  expect(summaries[2]).not.toContain('modules');
  expect(summaries[3]).toContain('Raw activity JSON');
  expect(html).not.toMatch(/<details\b[^>]*\bopen(?:[\s=>])/);
});

it('preserves provenance and pagination without inventing unavailable observation times', () => {
  const observed = { ...row('2', 2000, 'preparing'), received_at: new Date(3500).toISOString() };
  const unknown = {
    ...row('1', 1000, 'preparing'),
    observed_at: 'unrecorded',
    relayer: 'other-relayer',
  };
  const page = history([observed, unknown], 1);
  page.activityPage!.has_more = true;
  page.activityPage!.next_before_id = '1';
  const html = renderToStaticMarkup(
    <MessageActivityLog header={null} history={page} dispatchedAt={1000} />,
  );
  expect(html).toContain('aria-label="Relayer activity log"');
  expect(html).toContain('Since dispatch: </span>—');
  expect(html).toContain('Observation time unavailable');
  expect(html).toContain('Reporting relayer: other-relayer');
  expect(html).toContain('dateTime="1970-01-01T00:00:02.000Z"');
  expect(html).toContain('Observation → database');
  expect(html).toContain('1.5s');
  const pagination = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  expect(pagination).toHaveLength(3);
  expect(pagination.every((button) => !/\sdisabled(?:=|\s|>)/.test(button))).toBe(true);
});

it('measures consecutive reports from the same relayer instead of interleaved reporters', () => {
  const page = history([
    row('3', 4500, 'ready_to_submit'),
    { ...row('2', 4000, 'preparing'), relayer: 'other-relayer' },
    row('1', 2000, 'preparing'),
  ]);
  const html = renderToStaticMarkup(
    <MessageActivityLog header={null} history={page} dispatchedAt={1000} />,
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const intervals = doc.querySelectorAll('span[title^="Since prior report"]');
  expect(intervals).toHaveLength(1);
  expect(intervals[0].textContent).toBe('2.5s later than this relayer’s prior report');
  expect(intervals[0].getAttribute('title')).toContain(
    '#1 from this relayer: 1970-01-01T00:00:02.000Z → 1970-01-01T00:00:04.500Z (2500 ms)',
  );
  expect(intervals[0].parentElement?.textContent).toContain('+3.5s');
});

it('does not bridge missing or reversed timestamps, while retaining real zero intervals', () => {
  const page = history([
    row('5', 2500, 'preparing'),
    row('4', 2500, 'preparing'),
    row('3', 3000, 'preparing'),
    { ...row('2', 2000, 'preparing'), observed_at: 'unrecorded' },
    row('1', 1000, 'preparing'),
  ]);
  const html = renderToStaticMarkup(
    <MessageActivityLog header={null} history={page} dispatchedAt={1000} />,
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const intervals = doc.querySelectorAll('span[title^="Since prior report"]');
  expect(intervals).toHaveLength(1);
  expect(intervals[0].textContent).toBe('0ms later than this relayer’s prior report');
  expect(intervals[0].getAttribute('title')).toContain('#4 from this relayer');
});

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let rootElement: HTMLDivElement;
let root: Root;
beforeEach(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  rootElement = document.createElement('div');
  root = createRoot(rootElement);
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
const renderLog = async (page: ReturnType<typeof history>, key = 'message') => {
  await act(async () =>
    root.render(<MessageActivityLog header={null} key={key} history={page} dispatchedAt={1000} />),
  );
};
const visibleIds = () =>
  [...rootElement.querySelectorAll('[aria-label="Relayer activity log"] > li')].map(
    (li) => li.textContent?.match(/#(\d+) ·/)?.[1],
  );
const click = async (label: string) => {
  const button = [...rootElement.querySelectorAll('button')].find(
    (button) => button.textContent === label,
  )!;
  await act(async () => button.click());
};
const batch = (newest: number, count: number, page = 0, more = true) => {
  const result = history(
    Array.from({ length: count }, (_, index) =>
      row(String(newest - index), (newest - index) * 1000, 'preparing'),
    ),
    page,
  );
  result.activityPage!.has_more = more;
  result.activityPage!.next_before_id = more ? String(newest - count + 1) : null;
  return result;
};

it('shows eight records, freezes live prepends, and crosses both directions with the original cursor', async () => {
  const initial = batch(100, 50);
  await renderLog(initial);
  expect(visibleIds()).toEqual(['93', '94', '95', '96', '97', '98', '99', '100']);
  expect(
    rootElement.querySelector('span[title^="Since prior report"]')?.getAttribute('title'),
  ).toContain('#92 from this relayer');
  await click('← Earlier');
  expect(visibleIds()).toEqual(['85', '86', '87', '88', '89', '90', '91', '92']);
  const refreshed = batch(120, 50);
  refreshed.loadedActivities = [row('40', 40000, 'preparing')];
  await renderLog(refreshed);
  expect(visibleIds()).toEqual(['85', '86', '87', '88', '89', '90', '91', '92']);
  for (let i = 0; i < 5; i++) await click('← Earlier');
  expect(visibleIds()).toEqual(['51', '52']);
  const boundaryIntervals = rootElement.querySelectorAll('span[title^="Since prior report"]');
  expect(boundaryIntervals).toHaveLength(1);
  expect(boundaryIntervals[0].getAttribute('title')).toContain('#51 from this relayer');
  await click('← Earlier');
  expect(refreshed.next).toHaveBeenCalledWith('51');
  const older = batch(50, 50, 1, false);
  await renderLog(older);
  expect(visibleIds()).toEqual(['43', '44', '45', '46', '47', '48', '49', '50']);
  await click('Later →');
  expect(older.previous).toHaveBeenCalledTimes(1);
  await renderLog(refreshed);
  expect(visibleIds()).toEqual(['51', '52']);
  await click('Latest');
  expect(refreshed.latest).toHaveBeenCalledTimes(1);
  expect(visibleIds()).toEqual(['113', '114', '115', '116', '117', '118', '119', '120']);
});

it('handles a final partial batch, disables exhausted navigation, and resets for another message', async () => {
  const final = batch(10, 10, 2, false);
  await renderLog(final);
  expect(visibleIds()).toEqual(['3', '4', '5', '6', '7', '8', '9', '10']);
  await click('← Earlier');
  expect(visibleIds()).toEqual(['1', '2']);
  const earlier = [...rootElement.querySelectorAll('button')].find(
    (button) => button.textContent === '← Earlier',
  )!;
  expect(earlier.disabled).toBe(true);
  await click('Later →');
  expect(visibleIds()).toHaveLength(8);
  await renderLog(batch(200, 12), 'other-message');
  expect(visibleIds()).toEqual(['193', '194', '195', '196', '197', '198', '199', '200']);
});

it('preserves an error without claiming that no activity exists', async () => {
  const failed = history([]);
  failed.error = 'offline';
  await renderLog(failed);
  expect(rootElement.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
  expect(rootElement.textContent).not.toContain('No relayer activity recorded');
});
