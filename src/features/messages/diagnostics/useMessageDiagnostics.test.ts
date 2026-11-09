/** @jest-environment jsdom */
import { connectMessageDiagnostics } from './useMessageDiagnostics';

jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn() } }));
const messageId = `0x${'11'.repeat(32)}`;
const snapshot = { version: 1, message_id: messageId, partial: false, activities: [] };
class MockSocket {
  static instances: MockSocket[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  close = jest.fn();
  constructor(public url: string) {
    MockSocket.instances.push(this);
  }
  send(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  MockSocket.instances = [];
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: MockSocket });
});
afterEach(() => jest.useRealTimers());

function setup(fetchSnapshot = jest.fn(async () => snapshot), live = true) {
  const onSnapshot = jest.fn();
  const onConnection = jest.fn();
  const onError = jest.fn();
  const stop = connectMessageDiagnostics({
    messageId,
    live,
    wsUrl: 'wss://example.test/messages',
    fetchSnapshot,
    onSnapshot,
    onConnection,
    onError,
  });
  return { stop, fetchSnapshot, onSnapshot, onConnection, onError };
}

test('uses the socket snapshot without a duplicate initial HTTP request', async () => {
  const result = setup();
  expect(result.onConnection).not.toHaveBeenCalledWith('live');
  const current = MockSocket.instances[0];
  current.send({ type: 'diagnostics', data: snapshot });
  expect(result.onConnection).toHaveBeenLastCalledWith('live');
  expect(result.onSnapshot).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(10_000);
  expect(result.fetchSnapshot).not.toHaveBeenCalled();
  result.stop();
});

test('falls back to HTTP on unavailable reports and resumes when the socket recovers', async () => {
  const result = setup();
  await flush();
  const current = MockSocket.instances[0];
  current.send({ type: 'diagnostics', data: snapshot });
  current.send({ type: 'diagnostics_unavailable', message_ids: [messageId] });
  await flush();
  expect(result.onConnection).toHaveBeenLastCalledWith('disconnected');
  expect(result.fetchSnapshot).toHaveBeenCalledTimes(1);
  current.send({ type: 'diagnostics', data: snapshot });
  jest.advanceTimersByTime(10_000);
  expect(result.fetchSnapshot).toHaveBeenCalledTimes(1);
  result.stop();
});

test('reconnects on missing snapshots and heartbeat expiry; old callbacks cannot update', async () => {
  const result = setup();
  await flush();
  const old = MockSocket.instances[0];
  jest.advanceTimersByTime(10_000);
  expect(old.close).toHaveBeenCalled();
  jest.advanceTimersByTime(1_000);
  const current = MockSocket.instances[1];
  const count = result.onSnapshot.mock.calls.length;
  old.send({ type: 'diagnostics', data: snapshot });
  expect(result.onSnapshot).toHaveBeenCalledTimes(count);
  current.send({ type: 'diagnostics', data: snapshot });
  jest.advanceTimersByTime(65_000);
  expect(current.close).toHaveBeenCalled();
  result.stop();
  const closedCount = MockSocket.instances.length;
  jest.advanceTimersByTime(100_000);
  expect(MockSocket.instances).toHaveLength(closedCount);
});

test('historical mode fetches once without a socket or recurring polling', async () => {
  const result = setup(undefined, false);
  await flush();
  jest.advanceTimersByTime(100_000);
  expect(MockSocket.instances).toHaveLength(0);
  expect(result.fetchSnapshot).toHaveBeenCalledTimes(1);
  expect(result.onConnection).toHaveBeenLastCalledWith('historical');
  result.stop();
});

test('falls back after HTTP timeouts without overlapping requests', async () => {
  const result = setup(jest.fn(() => new Promise(() => {})));
  // The socket gets ten seconds to provide its initial snapshot before HTTP fallback starts.
  jest.advanceTimersByTime(25_000);
  await flush();
  expect(result.onError).toHaveBeenLastCalledWith('Diagnostics request timed out');
  jest.advanceTimersByTime(5_000);
  expect(result.fetchSnapshot).toHaveBeenCalledTimes(2);
  result.stop();
});

test('bounds websocket reconnect backoff', async () => {
  const result = setup();
  for (const delay of [1_000, 2_000, 4_000, 8_000, 10_000, 10_000]) {
    const current = MockSocket.instances.at(-1)!;
    current.onerror?.();
    await flush();
    const count = MockSocket.instances.length;
    jest.advanceTimersByTime(delay - 1);
    expect(MockSocket.instances).toHaveLength(count);
    jest.advanceTimersByTime(1);
    expect(MockSocket.instances).toHaveLength(count + 1);
    await flush();
  }
  result.stop();
});
