import type { ethers } from 'ethers';

export class AbortError extends Error {
  constructor() {
    super('Request aborted');
    this.name = 'AbortError';
  }
}

const ABORT_INTERCEPT_METHODS = new Set([
  'send',
  'perform',
  'performWithFallback', // SmartProvider's retry / multi-RPC fallback entry point
  'wrapProviderPerform', // SmartProvider's per-underlying-provider call wrapper
  'call',
  'getCode',
  'getBlock',
  'getBlockNumber',
  'getTransaction',
  'getTransactionReceipt',
]);

/**
 * Wraps a provider so every relevant call short-circuits with AbortError when
 * the signal fires. Intercepts the public surface AND `performWithFallback` /
 * `wrapProviderPerform` so the SmartProvider's retry + multi-RPC fallback also
 * bail out on abort instead of dispatching fresh network requests.
 */
export function wrapWithAbort(
  provider: ethers.providers.Provider,
  signal?: AbortSignal,
): ethers.providers.Provider {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (
        typeof prop === 'string' &&
        ABORT_INTERCEPT_METHODS.has(prop) &&
        typeof value === 'function'
      ) {
        return async (...args: unknown[]) => {
          if (signal?.aborted) throw new AbortError();
          return value.apply(target, args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as ethers.providers.Provider;
}
