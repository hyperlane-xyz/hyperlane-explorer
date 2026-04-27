import { type ChainMetadata, TokenStandard } from '@hyperlane-xyz/sdk';
import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type { WarpRouteChainAddressMap } from '@hyperlane-xyz/sdk/warp/read';
import { addressToBytes32, ProtocolType } from '@hyperlane-xyz/utils';

import { MessageStatus, type MessageStub } from '../../types';
import { parseWarpRouteMessageDetails } from './utils';

const ORIGIN_DOMAIN = 1;
const DEST_DOMAIN = 2;
const ORIGIN_CHAIN = 'originchain';
const DEST_CHAIN = 'destchain';
const SENDER = '0x1111111111111111111111111111111111111111';
const RECIPIENT = '0x2222222222222222222222222222222222222222';
const SENDER_BYTES32 = '0x000000000000000000000000' + SENDER.slice(2);
const RECIPIENT_BYTES32 = '0x000000000000000000000000' + RECIPIENT.slice(2);

interface TokenConfig {
  decimals: number;
  scale?: number | { numerator: number; denominator: number };
  wireDecimals?: number;
}

function buildTestSetup({
  originToken,
  destToken,
  messageAmount,
}: {
  originToken: TokenConfig;
  destToken: TokenConfig;
  messageAmount: bigint;
}) {
  const wireDecimals = Math.max(originToken.decimals, destToken.decimals);

  // Message body: 32 bytes recipient + 32 bytes amount
  const amountHex = messageAmount.toString(16).padStart(64, '0');
  const recipientHex = RECIPIENT_BYTES32.slice(2);
  const body = '0x' + recipientHex + amountHex;

  const message: MessageStub = {
    status: MessageStatus.Delivered,
    id: 'test-id',
    msgId: '0xabc',
    nonce: 1,
    sender: SENDER_BYTES32,
    recipient: RECIPIENT_BYTES32,
    originChainId: 1,
    originDomainId: ORIGIN_DOMAIN,
    destinationChainId: 2,
    destinationDomainId: DEST_DOMAIN,
    origin: { timestamp: 0, hash: '0x0', from: SENDER, to: RECIPIENT },
    body,
  };

  // Token map keys use the full bytes32 format since sender/recipient in messages
  // are bytes32 and getTokenFromWarpRouteChainAddressMap matches with endsWith
  const warpRouteChainAddressMap: WarpRouteChainAddressMap = {
    [ORIGIN_CHAIN]: {
      [SENDER_BYTES32]: {
        chainName: ORIGIN_CHAIN,
        standard: TokenStandard.EvmHypCollateral,
        addressOrDenom: SENDER,
        decimals: originToken.decimals,
        symbol: 'ORIG',
        name: 'Origin',
        scale: originToken.scale,
        wireDecimals: originToken.wireDecimals ?? wireDecimals,
      },
    },
    [DEST_CHAIN]: {
      [RECIPIENT_BYTES32]: {
        chainName: DEST_CHAIN,
        standard: TokenStandard.EvmHypSynthetic,
        addressOrDenom: RECIPIENT,
        decimals: destToken.decimals,
        symbol: 'DEST',
        name: 'Destination',
        scale: destToken.scale,
        wireDecimals: destToken.wireDecimals ?? wireDecimals,
      },
    },
  };

  const originMetadata = {
    name: ORIGIN_CHAIN,
    chainId: 1,
    domainId: ORIGIN_DOMAIN,
    protocol: ProtocolType.Ethereum,
  } as ChainMetadata;
  const destMetadata = {
    name: DEST_CHAIN,
    chainId: 2,
    domainId: DEST_DOMAIN,
    protocol: ProtocolType.Ethereum,
  } as ChainMetadata;
  const chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'> = {
    tryGetChainMetadata: (chain: string | number): ChainMetadata | null => {
      if (chain === ORIGIN_DOMAIN) return originMetadata;
      if (chain === DEST_DOMAIN) return destMetadata;
      return null;
    },
  };

  return { message, warpRouteChainAddressMap, chainMetadataResolver };
}

describe('parseWarpRouteMessageDetails', () => {
  describe('destAmount', () => {
    it('returns null when both tokens have no scale', () => {
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildTestSetup({
        originToken: { decimals: 18 },
        destToken: { decimals: 18 },
        messageAmount: 10n ** 18n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.destAmount).toBeNull();
    });

    it('returns null when scales are equivalent fractions', () => {
      // origin {2,4} and dest {1,2} both normalize to 1/2 — equal
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildTestSetup({
        originToken: { decimals: 18, scale: { numerator: 2, denominator: 4 } },
        destToken: { decimals: 18, scale: { numerator: 1, denominator: 2 } },
        messageAmount: 10n ** 18n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.destAmount).toBeNull();
    });

    it('computes destAmount using dest scale when scales differ (VRA-style)', () => {
      // VRA: origin scale=10, dest scale=1, both 18 decimals.
      // Sending 1 VRA from origin: localAmount=1e18, message=1e18*10=1e19.
      // Dest: localAmount = 1e19 * 1 / 1 = 1e19 → fromWei(1e19, 18) = "10".
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildTestSetup({
        originToken: { decimals: 18, scale: 10 },
        destToken: { decimals: 18, scale: 1 },
        messageAmount: 10n ** 19n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.amount).toBe('1');
      expect(result!.destAmount).toBe('10');
    });

    it('computes destAmount when only origin has scale (BSC USDT scale-down style)', () => {
      // Origin: 18 dec with scale {1, 1e12} (scale-down). Dest: 6 dec, no scale.
      // Sending 1 USDT from origin: localAmount=1e18, message=1e18*1/1e12=1e6.
      // Dest (no scale): localAmount = 1e6 → fromWei(1e6, 6) = "1".
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildTestSetup({
        originToken: { decimals: 18, scale: { numerator: 1, denominator: 1_000_000_000_000 } },
        destToken: { decimals: 6 },
        messageAmount: 1_000_000n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.amount).toBe('1');
      expect(result!.destAmount).toBe('1');
    });

    it('matches a Tron destination token whose registry address is base58 (T...)', () => {
      // USDT TRC20 on Tron — registry stores the base58 form, but the wire
      // recipient is bytes32 hex. The fix in formatAddress converts the wire
      // recipient back to base58 so the warp route lookup can match.
      const TRON_USDT_BASE58 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
      const TRON_USDT_BYTES32 = addressToBytes32(TRON_USDT_BASE58, ProtocolType.Tron);

      const messageAmount = 10n ** 6n;
      const amountHex = messageAmount.toString(16).padStart(64, '0');
      const recipientHex = TRON_USDT_BYTES32.slice(2);
      const body = '0x' + recipientHex + amountHex;

      const message: MessageStub = {
        status: MessageStatus.Delivered,
        id: 'test-id',
        msgId: '0xabc',
        nonce: 1,
        sender: SENDER_BYTES32,
        recipient: TRON_USDT_BYTES32,
        originChainId: 1,
        originDomainId: ORIGIN_DOMAIN,
        destinationChainId: 728126428,
        destinationDomainId: DEST_DOMAIN,
        origin: { timestamp: 0, hash: '0x0', from: SENDER, to: TRON_USDT_BASE58 },
        body,
      };

      const warpRouteChainAddressMap: WarpRouteChainAddressMap = {
        [ORIGIN_CHAIN]: {
          [SENDER_BYTES32]: {
            chainName: ORIGIN_CHAIN,
            standard: TokenStandard.EvmHypCollateral,
            addressOrDenom: SENDER,
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
            wireDecimals: 6,
          },
        },
        tron: {
          [TRON_USDT_BASE58]: {
            chainName: 'tron',
            standard: TokenStandard.EvmHypSynthetic,
            addressOrDenom: TRON_USDT_BASE58,
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
            wireDecimals: 6,
          },
        },
      };

      const originMetadata = {
        name: ORIGIN_CHAIN,
        chainId: 1,
        domainId: ORIGIN_DOMAIN,
        protocol: ProtocolType.Ethereum,
      } as ChainMetadata;
      const destMetadata = {
        name: 'tron',
        chainId: 728126428,
        domainId: DEST_DOMAIN,
        protocol: ProtocolType.Tron,
      } as ChainMetadata;
      const chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'> = {
        tryGetChainMetadata: (chain: string | number): ChainMetadata | null => {
          if (chain === ORIGIN_DOMAIN) return originMetadata;
          if (chain === DEST_DOMAIN) return destMetadata;
          return null;
        },
      };

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.destinationToken.symbol).toBe('USDT');
      expect(result!.transferRecipient).toBe(TRON_USDT_BASE58);
    });

    it('computes destAmount when only dest has scale (same decimals)', () => {
      // Origin: 18 dec, no scale. Dest: 18 dec with scale-down {1, 10}.
      // Sending 1 token from origin: localAmount=1e18, message=1e18 (no scale).
      // Dest: localAmount = 1e18 * 10 / 1 = 1e19 → fromWei(1e19, 18) = "10".
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildTestSetup({
        originToken: { decimals: 18 },
        destToken: { decimals: 18, scale: { numerator: 1, denominator: 10 } },
        messageAmount: 10n ** 18n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.amount).toBe('1');
      expect(result!.destAmount).toBe('10');
    });
  });
});
