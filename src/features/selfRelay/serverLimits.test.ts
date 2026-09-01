import { InFlightLimit, withDeadline } from './serverLimits';

describe('InFlightLimit', () => {
  it('rejects work beyond the in-flight bound until a slot is released', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const limit = new InFlightLimit(1);

    const first = limit.run(() => pending);
    expect(first).toBeDefined();
    expect(limit.run(async () => undefined)).toBeUndefined();

    release?.();
    await first;
    await expect(limit.run(async () => 'ready')).resolves.toBe('ready');
  });
});

describe('withDeadline', () => {
  it('rejects work that does not settle before the deadline', async () => {
    jest.useFakeTimers();
    const result = withDeadline(new Promise<never>(() => undefined), 100);
    const expectation = expect(result).rejects.toThrow('timed out');

    await jest.advanceTimersByTimeAsync(100);
    await expectation;
    jest.useRealTimers();
  });
});
