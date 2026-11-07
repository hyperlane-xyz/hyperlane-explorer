/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { useMessageActivityPage } from '../diagnostics/useMessageDiagnostics';
import type { OriginConfirmation } from '../diagnostics/useOriginConfirmation';
import { MessageLifecycleCard } from './MessageLifecycleCard';

jest.mock('@hyperlane-xyz/utils', () => ({ shortenAddress: (value: string) => value }));
jest.mock('@hyperlane-xyz/widgets', () => ({
  CopyButton: () => null,
  SpinnerIcon: ({ className }: { className?: string }) => (
    <svg data-testid="lifecycle-spinner" className={className} />
  ),
}));
jest.mock('../diagnostics/MessageDiagnosticsContext');
jest.mock('../diagnostics/useMessageDiagnostics');

const useDiagnostics = jest.mocked(useMessageDiagnosticsContext);
const useHistory = jest.mocked(useMessageActivityPage);
const message = {
  status: MessageStatus.Pending,
  origin: { timestamp: 1000, hash: 'origin' },
} as MessageStub;
const reporter = {
  relayer: '0x1111111111111111111111111111111111111111',
  activityId: '1',
  observedAt: '2026-11-07T11:09:25Z',
  state: { phase: 'preparing', modules: [], relayer_first_seen_at_millis: 2000 },
};
let container: HTMLDivElement;
let root: Root;
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeEach(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
  useHistory.mockReturnValue({
    activityPage: null,
    loadedActivities: [],
    page: 0,
    fetching: false,
    error: undefined,
    next: jest.fn(),
    previous: jest.fn(),
  });
  useDiagnostics.mockReturnValue({
    diagnostics: null,
    history: useHistory('message'),
    activities: [],
    connectionState: 'live',
    fetching: false,
    relayers: [reporter],
    observation: reporter,
    selectedRelayer: '',
    setSelectedRelayer: jest.fn(),
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
const stage = (label: string) =>
  container.querySelector(`[aria-label="${label}"]`)?.getAttribute('data-status');
const render = async (
  value = message,
  confirmed = false,
  originConfirmation?: OriginConfirmation,
) => {
  const context = useDiagnostics();
  const history = useHistory('message');
  useDiagnostics.mockReturnValue({
    ...context,
    history,
    activities: [
      ...(context.diagnostics?.activities ?? []),
      ...history.loadedActivities,
      ...(history.activityPage?.activities ?? []),
    ],
  });
  await act(async () =>
    root.render(
      <MessageLifecycleCard
        messageId="message"
        message={value}
        confirmed={confirmed}
        originConfirmation={originConfirmation}
      />,
    ),
  );
};

test('validating starts on pickup and delivery is the next active stage after readiness', async () => {
  await render();
  expect(stage('Picked up by relayer')).toBe('complete');
  expect(stage('Validated')).toBe('active');
  expect(container.textContent).toContain('Validating');
  const validating = container.querySelector('[aria-label="Validated"]')!;
  const progress = validating.querySelector('[role="progressbar"]')!;
  const fill = progress.firstElementChild;
  expect(progress.hasAttribute('aria-valuenow')).toBe(false);
  expect(progress.getAttribute('aria-valuetext')).toBe('In progress');
  await render();
  expect(validating.querySelector('[role="progressbar"]')).toBe(progress);
  expect(progress.firstElementChild).toBe(fill);
  useDiagnostics.mockReturnValue({
    ...useDiagnostics(),
    observation: { ...reporter, state: { phase: 'submitting', modules: [] } },
  });
  await render();
  expect(stage('Validated')).toBe('complete');
  expect(stage('Delivered')).toBe('active');
  expect(container.textContent).toContain('Delivering');
  expect(validating.firstElementChild).toBe(progress);
  expect(progress.firstElementChild).toBe(fill);
  expect((fill as HTMLElement).style.transform).toBe('scaleX(1)');
  expect(validating.querySelector('[data-testid="lifecycle-spinner"]')).toBeNull();
  expect(container.querySelectorAll('li')).toHaveLength(6);
});

test('indexed delivery wins over a late relayer retry and confirmation requires canonical evidence', async () => {
  useDiagnostics.mockReturnValue({
    ...useDiagnostics(),
    observation: {
      ...reporter,
      state: { phase: 'retrying', failure: { reason: 'retry' }, modules: [] },
    },
  });
  const delivered = {
    ...message,
    status: MessageStatus.Delivered,
    destination: { timestamp: 10000, hash: 'delivery' },
  };
  await render(delivered);
  expect(stage('Delivered')).toBe('complete');
  expect(stage('Confirmed')).toBe('active');
  expect(container.textContent).not.toContain('Relayer waiting to retry');
  await render(delivered, true);
  expect(stage('Confirmed')).toBe('complete');
  expect(container.textContent).toContain('Delivery confirmed');
  expect(container.querySelector('[aria-label="Confirmed"]')?.textContent).toContain('Confirmed');
  expect(container.textContent).not.toContain('Finality reached');
  expect(container.textContent).not.toContain('Confirmation time not recorded');
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
  expect(container.querySelector('[data-testid="lifecycle-spinner"]')).toBeNull();
});

test('an expected commit wait does not label the validation attempt as failed', async () => {
  useDiagnostics.mockReturnValue({
    ...useDiagnostics(),
    observation: {
      ...reporter,
      state: { phase: 'retrying', retry: { reason: 'AwaitingIcaReveal' }, modules: [] },
    },
  });
  await render();
  expect(stage('Validated')).toBe('active');
  expect(container.textContent).toContain('Waiting for commit confirmation');
});

test('failed validation retains unfinished wording without claiming validation succeeded', async () => {
  useDiagnostics.mockReturnValue({
    ...useDiagnostics(),
    observation: {
      ...reporter,
      state: { phase: 'retrying', failure: { reason: 'rpc_error' }, modules: [] },
    },
  });
  await render();
  expect(stage('Validated')).toBe('failed');
  expect(container.querySelector('[aria-label="Validated"]')?.textContent).toContain('Validating');
  expect(container.querySelector('[aria-label="Validated"]')?.textContent).not.toContain(
    'Validated',
  );
  expect(container.querySelector('[aria-label="Validated"] [role="progressbar"]')).toBeNull();
  expect(container.querySelector('[aria-label="Validated"] svg')).toBeNull();
});

test('an older log page retains its timing when outside the bounded history cache', async () => {
  useHistory.mockReturnValue({
    ...useHistory('message'),
    page: 21,
    activityPage: {
      message_id: 'message',
      has_more: false,
      next_before_id: null,
      activities: [
        {
          id: '1',
          relayer: reporter.relayer,
          observed_at: '1970-01-01T00:00:02Z',
          activity: { type: 'snapshot', state: reporter.state },
        },
      ],
    },
  });
  await render();
  const logs = container.querySelector('details')!;
  await act(async () => {
    logs.open = true;
    logs.dispatchEvent(new Event('toggle'));
  });
  expect(container.querySelector('[aria-label="Relayer activity log"]')?.textContent).toContain(
    '1s',
  );
  expect(container.querySelector('[aria-label="Relayer activity log"]')?.textContent).toContain(
    'Preparing',
  );
});

test('RPC-only delivery does not wait forever for an unavailable canonical finality signal', async () => {
  await render({
    ...message,
    isPiMsg: true,
    status: MessageStatus.Delivered,
    destination: { timestamp: 10000, hash: 'delivery' },
  });
  expect(stage('Delivered')).toBe('complete');
  expect(stage('Confirmed')).toBe('pending');
  expect(container.textContent).toContain('Delivered · confirmation not tracked');
  expect(container.querySelector('[aria-label="Confirmed"]')?.textContent).toContain('Not tracked');
});

test('shows recorded relayer confirmation time separately from the on-chain delivery duration', async () => {
  const row = {
    id: '2',
    relayer: reporter.relayer,
    observed_at: '1970-01-01T00:13:01Z',
    activity: {
      type: 'snapshot',
      state: { ...reporter.state, phase: 'delivered', delivered_observed_at_millis: 781000 },
    },
  };
  useDiagnostics.mockReturnValue({
    ...useDiagnostics(),
    observation: { ...reporter, activityId: '2', state: row.activity.state },
  });
  useHistory.mockReturnValue({
    ...useHistory('message'),
    activityPage: {
      message_id: 'message',
      has_more: false,
      next_before_id: null,
      activities: [
        row,
        {
          ...row,
          id: '1',
          observed_at: '1970-01-01T00:00:02Z',
          activity: { type: 'snapshot', state: reporter.state },
        },
      ],
    },
  });
  await render(
    {
      ...message,
      status: MessageStatus.Delivered,
      destination: { hash: 'delivered', timestamp: 181000 },
    },
    true,
  );
  const confirmation = container.querySelector('[aria-label="Confirmed"]');
  expect(confirmation?.textContent).toContain('10m after delivery');
  expect(confirmation?.textContent).toContain('Relayer observed');
  const logs = container.querySelector('details')!;
  await act(async () => {
    logs.open = true;
    logs.dispatchEvent(new Event('toggle'));
  });
  expect(logs.textContent).toContain('Delivered in 3m');
  expect(logs.textContent).toContain('13m');
  expect(logs.textContent).toContain('10m after delivery');
  expect(logs.textContent).not.toContain('Previous loaded');
  const summaries = [...logs.querySelectorAll('li > details > summary')];
  expect(summaries[0]?.textContent).toContain('Preparing');
  expect(summaries.at(-1)?.textContent).toContain('Relayer confirmed delivery');
  const activity = logs.querySelector('li:last-child > details')!;
  expect(activity.querySelector('summary')?.textContent).toContain('Relayer confirmed delivery');
  expect(activity.querySelector('summary')?.textContent).not.toContain('modules');
  expect(activity.querySelector('details')?.open).toBe(false);
});

test('shows early relay pickup without pretending origin confirmations already completed', async () => {
  await render(message, false, {
    required: 15,
    current: 2,
    blockNumber: 115,
    confirmed: false,
    tracked: true,
  });
  expect(stage('Origin confirmed')).toBe('active');
  expect(stage('Picked up by relayer')).toBe('complete');
  expect(stage('Validated')).toBe('active');
  expect(container.querySelector('[aria-label="Origin confirmed"]')?.textContent).toContain(
    '2 / 15 confirmations',
  );
  const progress = container.querySelector('[aria-label="Origin confirmed progress"]')!;
  const fill = progress.firstElementChild as HTMLElement;
  expect(progress.getAttribute('aria-valuenow')).toBe('2');
  expect(progress.getAttribute('aria-valuemax')).toBe('15');
  expect(fill.style.transform).toBe(`scaleX(${2 / 15})`);
  for (const current of [7, 1]) {
    await render(message, false, {
      required: 15,
      current,
      blockNumber: 115,
      confirmed: false,
      tracked: true,
    });
    expect(container.querySelector('[aria-label="Origin confirmed progress"]')).toBe(progress);
    expect(progress.firstElementChild).toBe(fill);
    expect(progress.getAttribute('aria-valuenow')).toBe(String(current));
    expect(fill.style.transform).toBe(`scaleX(${current / 15})`);
  }
  await render(message, false, {
    required: 15,
    current: 15,
    blockNumber: 115,
    timestamp: 10000,
    confirmed: true,
    tracked: true,
  });
  expect(container.querySelector('[aria-label="Picked up by relayer"]')?.textContent).toContain(
    '8s before origin confirmation',
  );
  expect(container.querySelector('[aria-label="Origin confirmed"]')?.firstElementChild).toBe(
    progress,
  );
  expect(fill.style.transform).toBe('scaleX(1)');
});

test('missing origin timestamps do not produce an epoch-sized delivery duration', async () => {
  await render(
    {
      ...message,
      origin: { hash: 'origin', timestamp: 0 },
      status: MessageStatus.Delivered,
      destination: { hash: 'delivery', timestamp: 1794050390922 },
    },
    true,
  );
  const logs = container.querySelector('details')!;
  await act(async () => {
    logs.open = true;
    logs.dispatchEvent(new Event('toggle'));
  });
  expect(logs.textContent).not.toContain('Delivered in');
});
