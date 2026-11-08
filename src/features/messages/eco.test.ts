import { decodeEcoMessage, isEcoMessage } from './eco';

// Captured Hyperlane message 0xe416b894a8cb8c8a0431dc0d6d5cf204f887f0e60e5d8d1725985290d3ecc311.
const message = {
  sender: '0xec08fb4647f3f50d1162a578d481266687c60fc5',
  recipient: '0xec08fb4647f3f50d1162a578d481266687c60fc5',
  body: '0x0000000000000001b2f5a835d773d6d65d9dcedc5338277ca16c3d2876977ff330f2a347dfe8ef3e0000000000000000000000001da38a31f369343bdd33ccc48e89d165e8ab3450',
};
const intentHash = '0xb2f5a835d773d6d65d9dcedc5338277ca16c3d2876977ff330f2a347dfe8ef3e';

it('decodes the captured Ethereum-to-Arbitrum fulfillment proof', () => {
  expect(decodeEcoMessage(message)).toEqual({
    executionChainId: '1',
    proofs: [
      {
        intentHash,
        claimant: '0x1da38a31f369343bdd33ccc48e89d165e8ab3450',
        outcome: 'fulfillment',
      },
    ],
  });
});

it('matches both known prover endpoints, including padded addresses', () => {
  expect(
    isEcoMessage({
      sender: `0x${message.sender.slice(2).toUpperCase().padStart(64, '0')}`,
      recipient: message.recipient,
    }),
  ).toBe(true);
  for (const endpoint of ['sender', 'recipient']) {
    expect(decodeEcoMessage({ ...message, [endpoint]: `0x${'1'.repeat(40)}` })).toBeNull();
    expect(
      isEcoMessage({ ...message, [endpoint]: `0x${'1'.repeat(24)}${message.sender.slice(2)}` }),
    ).toBe(false);
  }
});

it('decodes batched cancellation and ignored claimants without integer precision loss', () => {
  const claimants = [
    'e685056aec77686a83e2a6bdf37c6f71dd2fdb5f'.padStart(64, '0'),
    '0'.repeat(64),
    '1'.repeat(64),
  ];
  const body = `0x${'f'.repeat(16)}${claimants.map((claimant) => intentHash.slice(2) + claimant).join('')}`;
  const decoded = decodeEcoMessage({ ...message, body });
  expect(decoded).toMatchObject({ executionChainId: '18446744073709551615' });
  if (!decoded || 'error' in decoded) throw new Error('Expected decoded batch');
  expect(decoded.proofs.map((proof) => proof.outcome)).toEqual([
    'cancellation',
    'ignored',
    'ignored',
  ]);
  expect(decoded.proofs[2].claimant).toBe(`0x${'1'.repeat(64)}`);
});

it('rejects malformed, truncated and trailing bytes', () => {
  for (const body of ['', '0x', '0xzz', message.body.slice(0, -2), message.body + '00']) {
    expect(decodeEcoMessage({ ...message, body })).toEqual({ error: expect.any(String) });
  }
  // A header-only message is a valid no-op batch in Eco's BaseProver.
  expect(decodeEcoMessage({ ...message, body: '0x0000000000000001' })).toEqual({
    executionChainId: '1',
    proofs: [],
  });
});
