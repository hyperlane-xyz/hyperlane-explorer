import { type ChainMetadata, TokenStandard } from '@hyperlane-xyz/sdk';
import type { ChainMetadataResolver } from '@hyperlane-xyz/sdk/metadata/ChainMetadataResolver';
import type {
  WarpRouteChainAddressMap,
  WarpRouteIdToAddressesMap,
} from '@hyperlane-xyz/sdk/warp/read';
import {
  addressToBytes32,
  bytesToProtocolAddress,
  fromHexString,
  ProtocolType,
} from '@hyperlane-xyz/utils';

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

  // Token map keys use bytes32 while messages may carry protocol-native addresses;
  // getTokenFromWarpRouteChainAddressMap canonicalizes both before matching.
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
        wireDecimals: originToken.decimals,
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
        wireDecimals: destToken.decimals,
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

  return {
    message,
    warpRouteChainAddressMap,
    warpRouteIdToAddressesMap: {},
    chainMetadataResolver,
  };
}

describe('parseWarpRouteMessageDetails', () => {
  describe('destAmount', () => {
    it('returns null when both tokens have no scale', () => {
      const {
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      } = buildTestSetup({
        originToken: { decimals: 18 },
        destToken: { decimals: 18 },
        messageAmount: 10n ** 18n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.destAmount).toBeNull();
    });

    it('returns null when scales are equivalent fractions', () => {
      // origin {2,4} and dest {1,2} both normalize to 1/2 — equal
      const {
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      } = buildTestSetup({
        originToken: { decimals: 18, scale: { numerator: 2, denominator: 4 } },
        destToken: { decimals: 18, scale: { numerator: 1, denominator: 2 } },
        messageAmount: 10n ** 18n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.destAmount).toBeNull();
    });

    it('computes destAmount using dest scale when scales differ (VRA-style)', () => {
      // VRA: origin scale=10, dest scale=1, both 18 decimals.
      // Sending 1 VRA from origin: localAmount=1e18, message=1e18*10=1e19.
      // Dest: localAmount = 1e19 * 1 / 1 = 1e19 → fromWei(1e19, 18) = "10".
      const {
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      } = buildTestSetup({
        originToken: { decimals: 18, scale: 10 },
        destToken: { decimals: 18, scale: 1 },
        messageAmount: 10n ** 19n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
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
      const {
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      } = buildTestSetup({
        originToken: { decimals: 18, scale: { numerator: 1, denominator: 1_000_000_000_000 } },
        destToken: { decimals: 6 },
        messageAmount: 1_000_000n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.amount).toBe('1');
      expect(result!.destAmount).toBe('1');
    });

    it('matches a Tron destination token whose registry key is EVM-shaped hex', () => {
      // Production shape: hyperlane-registry stores Tron warp-route addresses as
      // EVM-style hex (e.g. 0xbf80...3421ec), while postgresByteaToAddress decodes
      // the wire recipient to Tron base58 before parseWarpRouteMessageDetails sees it.
      const TRON_ROUTER_HEX = '0xbf8078818627110fD05827Ca0aa9E4518d3421ec';
      const TRON_ROUTER_BYTES32 = addressToBytes32(TRON_ROUTER_HEX, ProtocolType.Ethereum);
      const TRON_ROUTER_BASE58 = bytesToProtocolAddress(
        fromHexString(TRON_ROUTER_BYTES32),
        ProtocolType.Tron,
      );

      const messageAmount = 10n ** 6n;
      const amountHex = messageAmount.toString(16).padStart(64, '0');
      const recipientHex = TRON_ROUTER_BYTES32.slice(2);
      const body = '0x' + recipientHex + amountHex;

      const message: MessageStub = {
        status: MessageStatus.Delivered,
        id: 'test-id',
        msgId: '0xabc',
        nonce: 1,
        sender: SENDER_BYTES32,
        recipient: TRON_ROUTER_BASE58,
        originChainId: 1,
        originDomainId: ORIGIN_DOMAIN,
        destinationChainId: 728126428,
        destinationDomainId: DEST_DOMAIN,
        origin: { timestamp: 0, hash: '0x0', from: SENDER, to: TRON_ROUTER_BASE58 },
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
          [TRON_ROUTER_HEX]: {
            chainName: 'tron',
            standard: TokenStandard.EvmHypSynthetic,
            addressOrDenom: TRON_ROUTER_HEX,
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
        {},
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.originToken.symbol).toBe('USDT');
      expect(result!.destinationToken.symbol).toBe('USDT');
      expect(result!.transferRecipient).toBe(TRON_ROUTER_BASE58);
    });

    it('matches a Tron origin token whose registry key is EVM-shaped hex', () => {
      const TRON_ROUTER_HEX = '0xbf8078818627110fD05827Ca0aa9E4518d3421ec';
      const TRON_ROUTER_BYTES32 = addressToBytes32(TRON_ROUTER_HEX, ProtocolType.Ethereum);
      const TRON_ROUTER_BASE58 = bytesToProtocolAddress(
        fromHexString(TRON_ROUTER_BYTES32),
        ProtocolType.Tron,
      );

      const messageAmount = 10n ** 6n;
      const amountHex = messageAmount.toString(16).padStart(64, '0');
      const recipientHex = RECIPIENT_BYTES32.slice(2);
      const body = '0x' + recipientHex + amountHex;

      const message: MessageStub = {
        status: MessageStatus.Delivered,
        id: 'test-id',
        msgId: '0xabc',
        nonce: 1,
        sender: TRON_ROUTER_BASE58,
        recipient: RECIPIENT,
        originChainId: 728126428,
        originDomainId: ORIGIN_DOMAIN,
        destinationChainId: 1,
        destinationDomainId: DEST_DOMAIN,
        origin: { timestamp: 0, hash: '0x0', from: TRON_ROUTER_BASE58, to: RECIPIENT },
        body,
      };

      const warpRouteChainAddressMap: WarpRouteChainAddressMap = {
        tron: {
          [TRON_ROUTER_HEX]: {
            chainName: 'tron',
            standard: TokenStandard.EvmHypCollateral,
            addressOrDenom: TRON_ROUTER_HEX,
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
            wireDecimals: 6,
          },
        },
        [DEST_CHAIN]: {
          [RECIPIENT_BYTES32]: {
            chainName: DEST_CHAIN,
            standard: TokenStandard.EvmHypSynthetic,
            addressOrDenom: RECIPIENT,
            decimals: 6,
            symbol: 'USDT',
            name: 'Tether USD',
            wireDecimals: 6,
          },
        },
      };

      const originMetadata = {
        name: 'tron',
        chainId: 728126428,
        domainId: ORIGIN_DOMAIN,
        protocol: ProtocolType.Tron,
      } as ChainMetadata;
      const destMetadata = {
        name: DEST_CHAIN,
        chainId: 1,
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

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        {},
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.originToken.symbol).toBe('USDT');
      expect(result!.destinationToken.symbol).toBe('USDT');
      expect(result!.transferRecipient).toBe(RECIPIENT);
    });

    it('computes destAmount when only dest has scale (same decimals)', () => {
      // Origin: 18 dec, no scale. Dest: 18 dec with scale-down {1, 10}.
      // Sending 1 token from origin: localAmount=1e18, message=1e18 (no scale).
      // Dest: localAmount = 1e18 * 10 / 1 = 1e19 → fromWei(1e19, 18) = "10".
      const {
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      } = buildTestSetup({
        originToken: { decimals: 18 },
        destToken: { decimals: 18, scale: { numerator: 1, denominator: 10 } },
        messageAmount: 10n ** 18n,
      });

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.amount).toBe('1');
      expect(result!.destAmount).toBe('10');
    });
  });

  describe('single-leg match via shared warp route (CosmosIbc)', () => {
    // TIA Celestia -> Forma. The celestia token is keyed in the registry by its
    // IBC denom (`utia`), but the on-chain sender is the hyperlane router app
    // (bytes32 "router_app..."), which never matches the denom. The forma leg
    // matches by address; the celestia token is then resolved via the route.
    const CELESTIA_DOMAIN = 1128614981;
    const FORMA_DOMAIN = 984122;
    const CELESTIA_ROUTER_BYTES32 =
      '0x726f757465725f61707000000000000000000000000000010000000000000008';
    const FORMA_TOKEN = '0x832d26B6904BA7539248Db4D58614251FD63dC05';
    const END_RECIPIENT = '0x2222222222222222222222222222222222222222';
    const END_RECIPIENT_BYTES32 = '0x000000000000000000000000' + END_RECIPIENT.slice(2);

    function buildCosmosIbcSetup() {
      const messageAmount = 10n ** 6n; // 1 TIA at 6 decimals
      const amountHex = messageAmount.toString(16).padStart(64, '0');
      const body = '0x' + END_RECIPIENT_BYTES32.slice(2) + amountHex;

      const message: MessageStub = {
        status: MessageStatus.Delivered,
        id: 'tia-id',
        msgId: '0xtia',
        nonce: 1,
        sender: CELESTIA_ROUTER_BYTES32,
        recipient: FORMA_TOKEN,
        originChainId: CELESTIA_DOMAIN,
        originDomainId: CELESTIA_DOMAIN,
        destinationChainId: FORMA_DOMAIN,
        destinationDomainId: FORMA_DOMAIN,
        origin: { timestamp: 0, hash: '0x0', from: CELESTIA_ROUTER_BYTES32, to: FORMA_TOKEN },
        body,
      };

      const warpRouteChainAddressMap: WarpRouteChainAddressMap = {
        celestia: {
          utia: {
            chainName: 'celestia',
            standard: TokenStandard.CosmosIbc,
            addressOrDenom: 'utia',
            decimals: 6,
            symbol: 'TIA',
            name: 'TIA',
            wireDecimals: 18,
          },
        },
        forma: {
          [FORMA_TOKEN]: {
            chainName: 'forma',
            standard: TokenStandard.EvmNative,
            addressOrDenom: FORMA_TOKEN,
            decimals: 18,
            symbol: 'TIA',
            name: 'TIA',
            wireDecimals: 18,
          },
        },
      };

      const celestiaMetadata = {
        name: 'celestia',
        chainId: CELESTIA_DOMAIN,
        domainId: CELESTIA_DOMAIN,
        protocol: ProtocolType.Cosmos,
        bech32Prefix: 'celestia',
      } as ChainMetadata;
      const formaMetadata = {
        name: 'forma',
        chainId: FORMA_DOMAIN,
        domainId: FORMA_DOMAIN,
        protocol: ProtocolType.Ethereum,
      } as ChainMetadata;
      const chainMetadataResolver: Pick<ChainMetadataResolver, 'tryGetChainMetadata'> = {
        tryGetChainMetadata: (chain: string | number): ChainMetadata | null => {
          if (chain === CELESTIA_DOMAIN) return celestiaMetadata;
          if (chain === FORMA_DOMAIN) return formaMetadata;
          return null;
        },
      };

      return { message, warpRouteChainAddressMap, chainMetadataResolver };
    }

    it('resolves the celestia token when only the forma leg matches by address', () => {
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildCosmosIbcSetup();
      const warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap = {
        'tia/forma-stride': [
          { chainName: 'celestia', address: 'utia' },
          { chainName: 'forma', address: FORMA_TOKEN },
        ],
      };

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeDefined();
      expect(result!.originToken.symbol).toBe('TIA');
      expect(result!.originToken.addressOrDenom).toBe('utia');
      expect(result!.destinationToken.addressOrDenom).toBe(FORMA_TOKEN);
      expect(result!.amount).toBe('1');
    });

    it('does not resolve when the route does not cover the other chain', () => {
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildCosmosIbcSetup();
      // Route contains the matched forma leg but not celestia — wrong transfer.
      const warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap = {
        'tia/forma-stride': [
          { chainName: 'stride', address: 'stride1xyz' },
          { chainName: 'forma', address: FORMA_TOKEN },
        ],
      };

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeUndefined();
    });

    it('does not resolve when the matched leg belongs to multiple routes with different counterparts', () => {
      const { message, warpRouteChainAddressMap, chainMetadataResolver } = buildCosmosIbcSetup();
      // Shared-collateral ambiguity: same forma token, two celestia counterparts.
      const warpRouteIdToAddressesMap: WarpRouteIdToAddressesMap = {
        'tia/forma-stride': [
          { chainName: 'celestia', address: 'utia' },
          { chainName: 'forma', address: FORMA_TOKEN },
        ],
        'tia/forma-other': [
          { chainName: 'celestia', address: 'uother' },
          { chainName: 'forma', address: FORMA_TOKEN },
        ],
      };

      const result = parseWarpRouteMessageDetails(
        message,
        warpRouteChainAddressMap,
        warpRouteIdToAddressesMap,
        chainMetadataResolver,
      );

      expect(result).toBeUndefined();
    });
  });
});
