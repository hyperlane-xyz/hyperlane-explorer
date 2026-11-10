import { decodeEcoMessage, isEcoMessage } from './eco';

// Captured Hyperlane message 0xe416b894a8cb8c8a0431dc0d6d5cf204f887f0e60e5d8d1725985290d3ecc311.
const message = {
  originDomainId: 1,
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
      originDomainId: message.originDomainId,
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

// Captured Solana -> Ethereum proof 0xb699a9764ee8e118a107dd7a3694389c9cf9f1b9babf9b7ff03105c0e07d23b9.
const solanaMessage = {
  originDomainId: 1399811149,
  sender: 'GpwQB7Tagvpy9L4maoBHyyLDJSULw2Jm8qrA2FUnpmTw',
  recipient: message.recipient,
  body: '0x00000000536f6c4df364b1850f828b07d3bef130069f074e1214aa98522062563dadd5ff0f0c086a0000000000000000000000001da38a31f369343bdd33ccc48e89d165e8ab3450',
};

it('classifies and decodes Solana proofs in native and full hex address formats', () => {
  const hex = 'eb271c9835e07375ea946dd4ad71aefd2559cb5da27e7ece8c5b13d3147a8652';
  for (const sender of [solanaMessage.sender, hex, `0x${hex}`, `0x${hex.toUpperCase()}`]) {
    expect(decodeEcoMessage({ ...solanaMessage, sender })).toEqual({
      executionChainId: '1399811149',
      proofs: [
        {
          intentHash: '0xf364b1850f828b07d3bef130069f074e1214aa98522062563dadd5ff0f0c086a',
          claimant: '0x1da38a31f369343bdd33ccc48e89d165e8ab3450',
          outcome: 'fulfillment',
        },
      ],
    });
  }
});

it('rejects lookalike Solana senders, other origins and unknown receiving provers', () => {
  for (const overrides of [
    { sender: solanaMessage.sender.toLowerCase() },
    { sender: `0x${'11'.repeat(32)}` },
    { sender: '0xad71aefd2559cb5da27e7ece8c5b13d3147a8652' },
    { originDomainId: 1 },
    { recipient: `0x${'11'.repeat(20)}` },
  ]) {
    expect(decodeEcoMessage({ ...solanaMessage, ...overrides })).toBeNull();
  }
});
