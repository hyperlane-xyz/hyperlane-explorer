import { fetchSealevelWarpRouteBalance } from './sealevelBalance';

jest.mock('../../../utils/logger', () => ({ logger: { debug: jest.fn() } }));

const token = {
  chainName: 'solanamainnet',
  addressOrDenom: 'router',
  collateralAddressOrDenom: 'mint',
  standard: 'SealevelHypCollateral',
};

afterEach(() => jest.restoreAllMocks());

test('fetches a registered Sealevel route balance with all token parameters', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify({ balance: '180400000' })));

  await expect(fetchSealevelWarpRouteBalance(token)).resolves.toBe(180400000n);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/sealevel-warp-route-balance?chainName=solanamainnet&addressOrDenom=router&standard=SealevelHypCollateral&collateralAddressOrDenom=mint',
  );
});

test('treats unavailable or invalid balance responses as unknown', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(fetchSealevelWarpRouteBalance(token)).resolves.toBeUndefined();
  fetchMock.mockResolvedValueOnce(new Response('{}'));
  await expect(fetchSealevelWarpRouteBalance(token)).resolves.toBeUndefined();
});
