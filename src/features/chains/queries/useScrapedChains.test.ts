/** @jest-environment jsdom */
import { act, createElement, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

import { useStore } from '../../../metadataStore';
import type { MessageStub } from '../../../types';
import { useRetainedMessage } from '../../messages/queries/useLiveMessages';
import type { DomainsEntry } from './fragments';
import { retryScrapedChains, useScrapedDomains } from './useScrapedChains';

jest.mock('../../../metadataStore', () => ({
  useStore: jest.requireActual('zustand').create(() => ({
    scrapedDomains: [],
    setScrapedDomains: jest.fn(),
  })),
}));
jest.mock('@hyperlane-xyz/utils', () => ({ objFilter: jest.fn() }));
jest.mock('urql', () => ({ useQuery: () => [{ fetching: true }, jest.fn()] }));

describe('retryScrapedChains', () => {
  it('retries failed prerequisites on each refresh', async () => {
    const error = new Error('registry unavailable');
    const ensureChainMetadata = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const retryDomains = jest.fn();

    await expect(retryScrapedChains(ensureChainMetadata, retryDomains)).rejects.toBe(error);
    await expect(retryScrapedChains(ensureChainMetadata, retryDomains)).resolves.toBeUndefined();

    expect(ensureChainMetadata).toHaveBeenCalledTimes(2);
    expect(retryDomains).toHaveBeenCalledTimes(2);
  });
});

test('keeps unresolved domains stable when retaining a message across parent renders', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previousDomains = useStore.getState().scrapedDomains;
  useStore.setState({ scrapedDomains: [] });
  const root = createRoot(document.createElement('div'));
  const seen: DomainsEntry[][] = [];
  const message = {
    msgId: '0x01',
    originDomainId: 1,
    origin: { hash: 'origin', timestamp: 1_000 },
  } as MessageStub;
  function Probe() {
    const { scrapedDomains } = useScrapedDomains();
    seen.push(scrapedDomains);
    // Message parsing depends on domains, just as in useMessageQuery.
    const parsed = useMemo(
      () => ({
        ...message,
        isPiMsg: !scrapedDomains.some((domain) => domain.id === message.originDomainId),
      }),
      [scrapedDomains],
    );
    useRetainedMessage(parsed);
    return null;
  }
  try {
    await act(async () => root.render(createElement(Probe)));
    await act(async () => root.render(createElement(Probe)));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  } finally {
    await act(async () => root.unmount());
    useStore.setState({ scrapedDomains: previousDomains });
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
