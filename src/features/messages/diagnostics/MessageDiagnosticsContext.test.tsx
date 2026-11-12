/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import {
  MessageDiagnosticsProvider,
  useMessageDiagnosticsContext,
} from './MessageDiagnosticsContext';
import type { DiagnosticActivity, DiagnosticState } from './types';
import {
  useMessageActivityPage,
  useMessageDiagnostics,
  type MessageDiagnosticsResult,
} from './useMessageDiagnostics';

jest.mock('./useMessageDiagnostics', () => ({
  useMessageActivityPage: jest.fn(),
  useMessageDiagnostics: jest.fn(),
}));

let root: ReturnType<typeof createRoot>;
let context: ReturnType<typeof useMessageDiagnosticsContext>;
let diagnostics: MessageDiagnosticsResult;
let history: ReturnType<typeof useMessageActivityPage>;

function Harness() {
  context = useMessageDiagnosticsContext();
  return null;
}

function row(
  id: number,
  type = 'snapshot',
  state: DiagnosticState = { phase: 'preparing', modules: [] },
): DiagnosticActivity {
  return {
    id: String(id),
    relayer: 'main',
    observed_at: new Date(id * 1000).toISOString(),
    activity: { type, state },
  };
}

async function render(messageId = 'first') {
  await act(async () =>
    root.render(
      <MessageDiagnosticsProvider messageId={messageId} live enabled>
        <Harness />
      </MessageDiagnosticsProvider>,
    ),
  );
}

beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }));
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});
beforeEach(() => {
  root = createRoot(document.createElement('div'));
  diagnostics = { diagnostics: null, relayers: [], connectionState: 'live', fetching: false };
  history = {
    activityPage: null,
    loadedActivities: [],
    complete: false,
    retry: jest.fn(),
    page: 0,
    fetching: false,
    error: undefined,
    next: jest.fn(),
    previous: jest.fn(),
    latest: jest.fn(),
  };
  jest.mocked(useMessageDiagnostics).mockImplementation(() => diagnostics);
  jest.mocked(useMessageActivityPage).mockImplementation(() => history);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

it('retains live observations across snapshot replacement and resets them on navigation', async () => {
  const first = row(1);
  const second = row(2);
  diagnostics.diagnostics = {
    version: 1,
    message_id: 'first',
    partial: false,
    activities: [first],
  };
  await render();
  diagnostics.diagnostics = { ...diagnostics.diagnostics, activities: [second] };
  await render();
  await render();
  expect(context.activities).toEqual([second, first]);
  await act(async () => context.setSelectedRelayer('main'));
  diagnostics.diagnostics = {
    ...diagnostics.diagnostics,
    message_id: 'next',
    activities: [row(3)],
  };
  await render('next');
  expect(context.activities.map((item) => item.id)).toEqual(['3']);
  expect(context.selectedRelayer).toBe('');
});

it.each([true, false])(
  'reconstructs history only when its snapshot and update share a page (%s)',
  async (contiguous) => {
    const anchor = row(1, 'snapshot', {
      phase: 'preparing',
      modules: [{ node_id: 'root', ism: 'ism', children: [] }],
    });
    const update = row(2, 'snapshot_update', { phase: 'ready_to_submit', modules: [] });
    history.activityPage = {
      message_id: 'first',
      activities: contiguous ? [update, anchor] : [update],
      has_more: false,
      next_before_id: null,
    };
    history.loadedActivities = contiguous ? [] : [anchor];
    await render();
    expect(context.observation?.state).toEqual(
      contiguous
        ? { phase: 'ready_to_submit', modules: anchor.activity.state?.modules }
        : { phase: 'unknown', modules: [] },
    );
    expect(context.activities).toEqual([update, anchor]);
  },
);

it('prefers the current relayer state over historical snapshots', async () => {
  const old = row(1, 'snapshot', { phase: 'delivered', modules: [] });
  history.loadedActivities = [old];
  diagnostics.relayers = [
    {
      relayer: 'main',
      activityId: '2',
      observedAt: old.observed_at,
      state: { phase: 'preparing', modules: [] },
    },
  ];
  await render();
  expect(context.observation).toBe(diagnostics.relayers[0]);
});

it('retains reconstructed state when loading an older page without current diagnostics', async () => {
  const anchor = row(100, 'snapshot', {
    phase: 'preparing',
    modules: [{ node_id: 'root', ism: 'ism', children: [] }],
  });
  const update = row(149, 'snapshot_update', { phase: 'awaiting_signatures', modules: [] });
  history.activityPage = {
    message_id: 'first',
    activities: [update, anchor],
    has_more: true,
    next_before_id: '100',
  };
  await render();
  const latest = context.observation;
  expect(latest?.state).toEqual({
    phase: 'awaiting_signatures',
    modules: anchor.activity.state?.modules,
  });

  history.loadedActivities = [update, anchor];
  history.activityPage = {
    ...history.activityPage,
    activities: [row(99)],
    has_more: false,
    next_before_id: null,
  };
  await render();
  expect(context.observation).toEqual(latest);
  expect(context.activities.map(({ id }) => id)).toEqual(['149', '100', '99']);

  history.activityPage = null;
  history.loadedActivities = [];
  await render('next');
  expect(context.observation).toBeUndefined();
});
