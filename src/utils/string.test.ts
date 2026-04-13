import { isWarpRouteIdFormat, sanitizeString } from './string';

test('sanitizeString removes special characters', () => {
  expect(sanitizeString('hello-world')).toBe('helloworld');
  expect(sanitizeString('test/route')).toBe('testroute');
  expect(sanitizeString('abc123')).toBe('abc123');
  expect(sanitizeString('')).toBe('');
});

test('isWarpRouteIdFormat identifies valid warp route IDs', () => {
  // Valid warp route IDs
  expect(isWarpRouteIdFormat('USDC/ethereum-base')).toBe(true);
  expect(isWarpRouteIdFormat('ETH/ethereum-arbitrum')).toBe(true);
  expect(isWarpRouteIdFormat('WBTC/mainnet-cctp')).toBe(true);
  expect(isWarpRouteIdFormat('A/b')).toBe(true);
  expect(isWarpRouteIdFormat('  USDC/route  ')).toBe(true); // with whitespace
});

test('isWarpRouteIdFormat rejects invalid inputs', () => {
  // Addresses (0x prefix)
  expect(isWarpRouteIdFormat('0x1234567890abcdef')).toBe(false);
  expect(isWarpRouteIdFormat('0xAbC/route')).toBe(false);

  // No slash
  expect(isWarpRouteIdFormat('USDC')).toBe(false);
  expect(isWarpRouteIdFormat('ethereum-base')).toBe(false);

  // Multiple slashes
  expect(isWarpRouteIdFormat('USDC/eth/base')).toBe(false);
  expect(isWarpRouteIdFormat('a/b/c')).toBe(false);

  // Too short
  expect(isWarpRouteIdFormat('')).toBe(false);
  expect(isWarpRouteIdFormat('/')).toBe(false);
  expect(isWarpRouteIdFormat('a/')).toBe(false);

  // Just whitespace
  expect(isWarpRouteIdFormat('   ')).toBe(false);
});
