type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback: typeof window.requestIdleCallback;
    cancelIdleCallback: typeof window.cancelIdleCallback;
  };

export function scheduleWhenIdle(
  callback: () => void,
  { timeout, fallbackDelay }: { timeout: number; fallbackDelay: number },
) {
  if (typeof window === 'undefined') return () => {};

  if ('requestIdleCallback' in window) {
    const idleWindow = window as IdleWindow;
    const idleId = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback(idleId);
  }

  const timeoutId = globalThis.setTimeout(callback, fallbackDelay);
  return () => globalThis.clearTimeout(timeoutId);
}
