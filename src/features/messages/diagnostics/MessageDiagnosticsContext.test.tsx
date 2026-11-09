/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import {
  MessageDiagnosticsProvider,
  useMessageDiagnosticsContext,
} from './MessageDiagnosticsContext';
import type { DiagnosticActivity, RelayerDiagnosticState } from './types';
import {
  type MessageDiagnosticsResult,
  useMessageActivityPage,
  useMessageDiagnostics,
} from './useMessageDiagnostics';

jest.mock('./useMessageDiagnostics', () => ({
  useMessageActivityPage: jest.fn(),
  useMessageDiagnostics: jest.fn(),
}));

const diagnosticsQuery = jest.mocked(useMessageDiagnostics);
const historyQuery = jest.mocked(useMessageActivityPage);
const messageId = `0x${'11'.repeat(32)}`;
const nextMessageId = `0x${'22'.repeat(32)}`;

function activity(id: number, relayer = 'main'): DiagnosticActivity {
  return {
    id: String(id),
    version: 1,
    relayer,
    observed_at: new Date(1_000_000 + id).toISOString(),
    activity: {
      type: 'snapshot_update',
      state: { phase: 'awaiting_signatures', modules: [] },
    },
  };
}

function relay(relayer: string, activityId: string, phase: string): RelayerDiagnosticState {
  return {
    relayer,
    activityId,
    observedAt: '2026-11-09T16:56:43.799Z',
    state: { phase, modules: [] },
  };
}

function response(
  rows: DiagnosticActivity[],
  relayers: RelayerDiagnosticState[] = [],
  id = messageId,
): MessageDiagnosticsResult {
  return {
    diagnostics: { version: 1, message_id: id, partial: false, activities: rows },
    relayers,
    connectionState: 'live',
    fetching: false,
  };
}

function historyResponse(
  activities: DiagnosticActivity[],
  loadedActivities: DiagnosticActivity[] = [],
): ReturnType<typeof useMessageActivityPage> {
  return {
    activityPage: {
      message_id: messageId,
      activities,
      has_more: false,
      next_before_id: null,
    },
    loadedActivities,
    page: 0,
    fetching: false,
    error: undefined,
    next: jest.fn(),
    previous: jest.fn(),
    latest: jest.fn(),
  };
}

let result: ReturnType<typeof useMessageDiagnosticsContext> | undefined;

function Harness() {
  result = useMessageDiagnosticsContext();
  return null;
}

function current() {
  if (!result) throw new Error('Diagnostics provider has not rendered');
  return result;
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

beforeEach(() => {
  result = undefined;
  historyQuery.mockReturnValue({
    activityPage: null,
    loadedActivities: [],
    page: 0,
    fetching: false,
    error: undefined,
    next: jest.fn(),
    previous: jest.fn(),
    latest: jest.fn(),
  });
});

it('retains exact live observations through replacement snapshots, rerenders, and delivery', async () => {
  const root = createRoot(document.createElement('div'));
  const first = activity(1);
  const second = activity(2);
  const delivered = activity(3);
  const render = (live = true) =>
    act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={messageId} live={live} enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });

  try {
    diagnosticsQuery.mockReturnValue(response([first]));
    await render();
    diagnosticsQuery.mockReturnValue(response([second]));
    await render();
    expect(current().activities).toEqual([second, first]);
    expect(current().activities[1].observed_at).toBe(first.observed_at);

    diagnosticsQuery.mockReturnValue(response([first, second]));
    await render();
    await render();
    expect(current().activities).toEqual([second, first]);

    diagnosticsQuery.mockReturnValue({ ...response([delivered]), connectionState: 'historical' });
    await render(false);
    expect(current().activities).toEqual([delivered, second, first]);
  } finally {
    await act(async () => root.unmount());
  }
});

it('preserves each relayer and explicit selection, then clears history and selection for a new message', async () => {
  const root = createRoot(document.createElement('div'));
  const first = activity(1, 'main');
  const second = activity(2, 'partner');
  const render = (id = messageId) =>
    act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={id} live enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });

  try {
    diagnosticsQuery.mockReturnValue(
      response([first], [relay('main', '1', 'awaiting_signatures')]),
    );
    await render();
    expect(current().observation?.relayer).toBe('main');

    diagnosticsQuery.mockReturnValue(
      response(
        [second],
        [relay('main', '1', 'awaiting_signatures'), relay('partner', '2', 'preparing')],
      ),
    );
    await render();
    expect(current().observation?.relayer).toBe('main');
    await act(async () => current().setSelectedRelayer('partner'));

    diagnosticsQuery.mockReturnValue(
      response(
        [activity(3)],
        [relay('main', '3', 'delivered'), relay('partner', '2', 'preparing')],
      ),
    );
    await render();
    expect(current().observation?.relayer).toBe('partner');
    expect(current().activities.find((row) => row.id === '1')?.relayer).toBe('main');
    expect(current().activities.find((row) => row.id === '2')?.relayer).toBe('partner');

    const next = activity(4, 'other');
    diagnosticsQuery.mockReturnValue(
      response([next], [relay('other', '4', 'preparing')], nextMessageId),
    );
    await render(nextMessageId);
    expect(current().activities).toEqual([next]);
    expect(current().selectedRelayer).toBe('');
    expect(current().observation?.relayer).toBe('other');
  } finally {
    await act(async () => root.unmount());
  }
});

it('bounds retained activity using the shared history limit', async () => {
  const root = createRoot(document.createElement('div'));
  diagnosticsQuery.mockReturnValue(
    response(Array.from({ length: 1_005 }, (_, index) => activity(index))),
  );
  try {
    await act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={messageId} live enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });
    expect(current().activities).toHaveLength(1_000);
    expect(current().activities[0].id).toBe('1004');
    expect(current().activities.at(-1)?.id).toBe('5');
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps history selectable when current diagnostics fail, reconstructing a contiguous snapshot and update', async () => {
  const root = createRoot(document.createElement('div'));
  const anchor: DiagnosticActivity = {
    ...activity(1),
    activity: {
      type: 'snapshot',
      state: {
        phase: 'awaiting_signatures',
        relayer_first_seen_at_millis: 1_000_001,
        modules: [{ node_id: 'root', ism: 'ism', children: [] }],
      },
    },
  };
  const update: DiagnosticActivity = {
    ...activity(2),
    activity: {
      type: 'snapshot_update',
      state: { phase: 'ready_to_submit', modules: [], relayer_first_seen_at_millis: 1_000_001 },
    },
  };
  diagnosticsQuery.mockReturnValue({
    diagnostics: null,
    relayers: [],
    connectionState: 'historical',
    fetching: false,
    error: 'Diagnostics unavailable',
  });
  historyQuery.mockReturnValue(historyResponse([update, anchor]));
  try {
    await act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={messageId} live={false} enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });
    expect(current().error).toBe('Diagnostics unavailable');
    expect(current().relayers.map((value) => value.relayer)).toEqual(['main']);
    expect(current().observation).toMatchObject({
      activityId: '2',
      observedAt: update.observed_at,
      state: {
        phase: 'ready_to_submit',
        relayer_first_seen_at_millis: 1_000_001,
        modules: [{ node_id: 'root', ism: 'ism', children: [] }],
      },
    });
    expect(current().activities).toEqual([update, anchor]);
  } finally {
    await act(async () => root.unmount());
  }
});

it('always prefers current diagnostics state over historical snapshots for the same relayer', async () => {
  const root = createRoot(document.createElement('div'));
  const currentRelay = relay('main', '2', 'preparing');
  const old: DiagnosticActivity = {
    ...activity(9),
    activity: { type: 'snapshot', state: { phase: 'delivered', modules: [] } },
  };
  diagnosticsQuery.mockReturnValue(response([], [currentRelay]));
  historyQuery.mockReturnValue(historyResponse([old]));
  try {
    await act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={messageId} live enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });
    expect(current().observation).toBe(currentRelay);
    expect(current().relayers).toEqual([currentRelay]);
    expect(current().activities).toEqual([old]);
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps legacy and unanchored histories visible without inventing current state or first-seen time', async () => {
  const root = createRoot(document.createElement('div'));
  const older: DiagnosticActivity = {
    ...activity(1),
    activity: { type: 'snapshot', state: { phase: 'delivered', modules: [] } },
  };
  const legacy: DiagnosticActivity = {
    ...activity(2),
    activity: { type: 'delivered' },
  };
  const unanchored: DiagnosticActivity = {
    ...activity(3, 'partner'),
    activity: {
      type: 'snapshot_update',
      state: { phase: 'delivered', modules: [], removed_modules: [] },
    },
  };
  diagnosticsQuery.mockReturnValue({ ...response([]), diagnostics: null });
  historyQuery.mockReturnValue(historyResponse([unanchored, legacy, older]));
  try {
    await act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={messageId} live={false} enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });
    expect(current().relayers).toEqual([
      {
        relayer: 'main',
        activityId: '2',
        observedAt: legacy.observed_at,
        state: { phase: 'unknown', modules: [] },
      },
      {
        relayer: 'partner',
        activityId: '3',
        observedAt: unanchored.observed_at,
        state: { phase: 'unknown', modules: [] },
      },
    ]);
    expect(current().observation?.activityId).toBe('2');
    expect(current().observation?.state.relayer_first_seen_at_millis).toBeUndefined();
    await act(async () => current().setSelectedRelayer('partner'));
    expect(current().observation?.activityId).toBe('3');
    expect(current().observation?.state.relayer_first_seen_at_millis).toBeUndefined();
    expect(current().activities).toEqual([unanchored, legacy, older]);
  } finally {
    await act(async () => root.unmount());
  }
});

it('does not reconstruct a cumulative update against a potentially obsolete anchor on a sparse older page', async () => {
  const root = createRoot(document.createElement('div'));
  const anchor: DiagnosticActivity = {
    ...activity(1),
    activity: {
      type: 'snapshot',
      state: { phase: 'delivered', modules: [{ node_id: 'old', ism: 'old', children: [] }] },
    },
  };
  const latest: DiagnosticActivity = {
    ...activity(9),
    activity: { type: 'snapshot_update', state: { phase: 'ready_to_submit', modules: [] } },
  };
  diagnosticsQuery.mockReturnValue({ ...response([]), diagnostics: null });
  historyQuery.mockReturnValue(historyResponse([latest], [anchor]));
  try {
    await act(async () => {
      root.render(
        <MessageDiagnosticsProvider messageId={messageId} live={false} enabled>
          <Harness />
        </MessageDiagnosticsProvider>,
      );
    });
    expect(current().observation).toEqual({
      relayer: 'main',
      activityId: '9',
      observedAt: latest.observed_at,
      state: { phase: 'unknown', modules: [] },
    });
    expect(current().activities).toEqual([latest, anchor]);
  } finally {
    await act(async () => root.unmount());
  }
});
