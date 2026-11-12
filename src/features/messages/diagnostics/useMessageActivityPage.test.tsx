/** @jest-environment jsdom */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useQuery } from 'urql';

import { useMessageActivityPage } from './useMessageDiagnostics';

jest.mock('urql', () => ({ useQuery: jest.fn(), useClient: jest.fn() }));
const query = jest.mocked(useQuery);
const messageId = `0x${'11'.repeat(32)}`;
const refresh = jest.fn();
const response = (beforeId: string | null, id: string, nextId: string | null) => ({
  data: {
    message_activity: {
      message_id: messageId,
      has_more: nextId !== null,
      next_before_id: nextId,
      activities: [
        {
          id,
          relayer: 'relayer',
          observed_at: '2026-11-08T10:00:00Z',
          activity: { type: 'snapshot' },
        },
      ],
    },
  },
  fetching: false,
  operation: { variables: { beforeId } },
});

it('uses the viewed cursor after a live refresh, keeps loaded timing history, and returns to latest', async () => {
  const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.createElement('div'));
  let latest = response(null, '100', '51');
  const older = response('51', '50', null);
  query.mockImplementation(
    ({ variables }) => [variables?.beforeId === '51' ? older : latest, refresh] as never,
  );
  let result!: ReturnType<typeof useMessageActivityPage>;
  function Harness() {
    result = useMessageActivityPage(messageId);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    const frozenCursor = result.activityPage!.next_before_id!;
    latest = response(null, '120', '71');
    await act(async () => root.render(<Harness />));
    expect(result.activityPage!.next_before_id).toBe('71');
    await act(async () => result.next(frozenCursor));
    expect(result.page).toBe(1);
    expect(result.activityPage!.activities[0].id).toBe('50');
    expect(result.loadedActivities.map((row) => row.id).sort()).toEqual(['100', '120', '50']);
    expect(query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: { messageId, beforeId: '51', limit: 50 },
      }),
    );
    await act(async () => result.latest());
    expect(result.page).toBe(0);
    expect(result.activityPage!.activities[0].id).toBe('120');
  } finally {
    await act(async () => root.unmount());
    delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
  }
});

it('automatically loads earlier pages before declaring first-collection history complete', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.createElement('div'));
  const latest = response(null, '100', '51');
  const older = response('51', '50', null);
  let pending = true;
  query.mockImplementation(({ variables }) => {
    const page = variables?.beforeId === '51' ? older : latest;
    return [{ ...page, fetching: variables?.beforeId === '51' && pending }, refresh] as never;
  });
  let result: ReturnType<typeof useMessageActivityPage> | undefined;
  function Harness() {
    result = useMessageActivityPage(messageId, true, true);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    // Even if a query library exposes stale data while fetching, it cannot complete history.
    expect(result?.fetching).toBe(true);
    pending = false;
    await act(async () => root.render(<Harness />));
    expect(result?.complete).toBe(true);
    expect(result?.loadedActivities.map((row) => row.id)).toEqual(['100', '50']);
    expect(result?.page).toBe(1);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
