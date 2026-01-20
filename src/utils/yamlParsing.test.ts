import { bytes32ToProtocolAddress, normalizeAddressToHex } from './yamlParsing';

describe('bytes32ToProtocolAddress', () => {
  describe('cosmos protocol', () => {
    it('converts padded 20-byte address (12 leading zero bytes) to bech32', () => {
      // 20-byte address padded to 32 bytes with leading zeros
      const paddedHex = '0x000000000000000000000000aabbccdd11223344556677889900aabbccdd1122';
      const result = bytes32ToProtocolAddress(paddedHex, 'cosmos', 'cosmos');
      // Should extract last 20 bytes and encode as bech32
      expect(result).toMatch(/^cosmos1/);
      expect(result.length).toBeGreaterThan(40);
    });

    it('converts full 32-byte contract address to bech32', () => {
      // Full 32-byte address (no leading zero padding pattern)
      const fullHex = '0xbd477fbb1b6ba73694bd41b71407dc058756624df4775a1f57c72dfbc58d5fda';
      const result = bytes32ToProtocolAddress(fullHex, 'cosmos', 'stride');
      expect(result).toBe('stride1h4rhlwcmdwnnd99agxm3gp7uqkr4vcjd73m4586hcuklh3vdtldqgqmjxc');
    });

    it('handles input without 0x prefix', () => {
      const hex = 'bd477fbb1b6ba73694bd41b71407dc058756624df4775a1f57c72dfbc58d5fda';
      const result = bytes32ToProtocolAddress(hex, 'cosmos', 'stride');
      expect(result).toBe('stride1h4rhlwcmdwnnd99agxm3gp7uqkr4vcjd73m4586hcuklh3vdtldqgqmjxc');
    });
  });

  describe('non-cosmos protocol', () => {
    it('returns hex address for ethereum protocol', () => {
      const hex = '0x832d26b6904ba7539248db4d58614251fd63dc05';
      const result = bytes32ToProtocolAddress(hex, 'ethereum');
      expect(result).toBe('0x832d26b6904ba7539248db4d58614251fd63dc05');
    });

    it('returns hex address when no bech32Prefix provided', () => {
      const hex = '0xbd477fbb1b6ba73694bd41b71407dc058756624df4775a1f57c72dfbc58d5fda';
      const result = bytes32ToProtocolAddress(hex, 'cosmos');
      expect(result).toBe('0xbd477fbb1b6ba73694bd41b71407dc058756624df4775a1f57c72dfbc58d5fda');
    });
  });
});

describe('normalizeAddressToHex', () => {
  it('returns hex addresses as-is (lowercase)', () => {
    expect(normalizeAddressToHex('0xAbCdEf')).toBe('0xabcdef');
    expect(normalizeAddressToHex('0x832d26b6904ba7539248db4d58614251fd63dc05')).toBe(
      '0x832d26b6904ba7539248db4d58614251fd63dc05',
    );
  });

  it('decodes bech32 cosmos addresses to hex', () => {
    const bech32 = 'stride1h4rhlwcmdwnnd99agxm3gp7uqkr4vcjd73m4586hcuklh3vdtldqgqmjxc';
    const hex = normalizeAddressToHex(bech32);
    expect(hex).toBe('0xbd477fbb1b6ba73694bd41b71407dc058756624df4775a1f57c72dfbc58d5fda');
  });

  it('does not mangle short cosmos denoms', () => {
    expect(normalizeAddressToHex('uatom')).toBe('uatom');
    expect(normalizeAddressToHex('utia')).toBe('utia');
    expect(normalizeAddressToHex('ustrd')).toBe('ustrd');
  });

  it('does not mangle IBC denoms', () => {
    const ibcDenom = 'ibc/BF3B4F53F3694B66E13C23107C84B6485BD2B96296BB7EC680EA77BBA75B4801';
    expect(normalizeAddressToHex(ibcDenom)).toBe(ibcDenom.toLowerCase());
  });
});
