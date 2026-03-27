/** @jest-environment jsdom */

import { scheduleWhenIdle } from './scheduleWhenIdle';

describe('scheduleWhenIdle', () => {
  const originalRequestIdleCallback = window.requestIdleCallback;
  const originalCancelIdleCallback = window.cancelIdleCallback;

  afterEach(() => {
    jest.restoreAllMocks();

    if (originalRequestIdleCallback) {
      Object.defineProperty(window, 'requestIdleCallback', {
        configurable: true,
        writable: true,
        value: originalRequestIdleCallback,
      });
    } else {
      Reflect.deleteProperty(window, 'requestIdleCallback');
    }

    if (originalCancelIdleCallback) {
      Object.defineProperty(window, 'cancelIdleCallback', {
        configurable: true,
        writable: true,
        value: originalCancelIdleCallback,
      });
    } else {
      Reflect.deleteProperty(window, 'cancelIdleCallback');
    }
  });

  it('uses requestIdleCallback when available', () => {
    const callback = jest.fn();
    const requestIdleCallback = jest.fn().mockReturnValue(123);
    const cancelIdleCallback = jest.fn();

    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: requestIdleCallback,
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      writable: true,
      value: cancelIdleCallback,
    });

    const cleanup = scheduleWhenIdle(callback, { timeout: 1_500, fallbackDelay: 500 });

    expect(requestIdleCallback).toHaveBeenCalledWith(callback, { timeout: 1_500 });

    cleanup();

    expect(cancelIdleCallback).toHaveBeenCalledWith(123);
  });

  it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    const callback = jest.fn();
    const setTimeoutSpy = jest
      .spyOn(globalThis, 'setTimeout')
      .mockReturnValue(123 as unknown as ReturnType<typeof globalThis.setTimeout>);
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout').mockImplementation(jest.fn());

    Reflect.deleteProperty(window, 'requestIdleCallback');
    Reflect.deleteProperty(window, 'cancelIdleCallback');

    const cleanup = scheduleWhenIdle(callback, { timeout: 1_500, fallbackDelay: 500 });

    expect(setTimeoutSpy).toHaveBeenCalledWith(callback, 500);

    cleanup();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
  });
});
