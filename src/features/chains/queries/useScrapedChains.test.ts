import { retryScrapedChains } from './useScrapedChains';

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
