import type { IRegistry } from '@hyperlane-xyz/registry';

import { loadChainMetadata } from './features/chains/loadChainMetadata';
import { useStore } from './metadataStore';

jest.mock('./features/chains/loadChainMetadata', () => ({
  loadChainMetadata: jest.fn(),
}));

const mockLoadChainMetadata = jest.mocked(loadChainMetadata);

describe('metadata store', () => {
  it('stores a chain metadata load failure and allows retry', async () => {
    const registry = {} as IRegistry;
    const error = new Error('registry unavailable');
    mockLoadChainMetadata.mockRejectedValueOnce(error).mockResolvedValueOnce({});
    useStore.getState().setRegistry(registry);

    await expect(useStore.getState().ensureChainMetadata()).rejects.toBe(error);

    expect(useStore.getState().chainMetadataError).toBe(error);
    expect(useStore.getState().isChainMetadataLoaded).toBe(false);

    await expect(useStore.getState().ensureChainMetadata()).resolves.toBeUndefined();

    expect(useStore.getState().chainMetadataError).toBeNull();
    expect(useStore.getState().isChainMetadataLoaded).toBe(true);
  });
});
