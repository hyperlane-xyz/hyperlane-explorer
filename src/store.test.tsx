/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { useMultiProviderInitFailed } from './store';

interface MetadataState {
  chainMetadata: Record<string, object>;
}

const mockBuildProvider = jest.fn<Promise<{ getKnownChainNames: () => string[] }>, []>();
const mockSubscribe = jest.fn<void, [(state: MetadataState, prev: MetadataState) => void]>();

jest.mock('./features/hyperlane/sdkRuntime', () => ({
  createEmptyMultiProvider: () => ({ getKnownChainNames: () => [] }),
  createRuntimeMultiProvider: () => mockBuildProvider(),
}));
jest.mock('./metadataStore', () => ({
  useStore: Object.assign(() => undefined, {
    getState: () => ({
      isChainMetadataLoaded: true,
      chainMetadata: { ethereum: {} },
      ensureChainMetadata: () => Promise.resolve(),
    }),
    subscribe: (listener: (state: MetadataState, prev: MetadataState) => void) =>
      mockSubscribe(listener),
  }),
}));

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  jest.restoreAllMocks();
});

let hasInitFailed: boolean | undefined;

function Probe() {
  hasInitFailed = useMultiProviderInitFailed();
  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function rebuildProvider(chainMetadata: Record<string, object>) {
  const [listener] = mockSubscribe.mock.calls[0];
  await act(async () => {
    listener({ chainMetadata }, { chainMetadata: {} });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// The provider store is a module singleton, so these steps build on each other
describe('multi provider init failure', () => {
  it('is reported when the first provider build fails', async () => {
    mockBuildProvider.mockRejectedValueOnce(new Error('runtime import failed'));
    const root = createRoot(document.createElement('div'));

    await act(async () => root.render(<Probe />));
    await settle();

    expect(hasInitFailed).toBe(true);
  });

  it('is cleared once a provider is built', async () => {
    mockBuildProvider.mockResolvedValueOnce({ getKnownChainNames: () => ['ethereum'] });

    await rebuildProvider({ ethereum: {}, base: {} });

    expect(hasInitFailed).toBe(false);
  });

  it('is not reported when a rebuild fails while a provider is ready', async () => {
    mockBuildProvider.mockRejectedValueOnce(new Error('runtime import failed'));

    await rebuildProvider({ ethereum: {}, base: {}, optimism: {} });

    expect(hasInitFailed).toBe(false);
  });
});
