import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { APP_DESCRIPTION, APP_NAME } from '../../consts/appMetadata';
import { links } from '../../consts/links';
import {
  fetchDomainNames,
  fetchMessageForOG,
  type MessageOGData,
} from '../../features/messages/queries/serverFetch';
import { formatAmountWithCommas } from '../../utils/amount';
import {
  adjustColorForBackground,
  DEFAULT_CHAIN_COLORS,
  extractChainColors,
  type ChainColors,
} from '../../utils/colorExtraction';
import { logger } from '../../utils/logger';
import { getEffectiveDecimals, getWarpRouteAmountParts } from '../../utils/warpRouteAmounts';
import {
  fetchChainMetadata,
  fetchWarpRouteMap,
  getChainDisplayName,
  normalizeAddressToHex,
  type WarpRouteMap,
  type WarpToken,
} from '../../utils/yamlParsing';

// ============================================================================
// Types
// ============================================================================

interface WarpTransferDetails {
  token: WarpToken;
  amount: string;
}

// ============================================================================
// Config
// ============================================================================

export const config = {
  runtime: 'edge',
};

// Global font cache to avoid reloading on every request
// Edge runtime persists module-level state across requests within the same instance
let fontCache: { valve: ArrayBuffer; mono: ArrayBuffer } | null = null;

async function loadFonts(baseUrl: string): Promise<{ valve: ArrayBuffer; mono: ArrayBuffer }> {
  if (fontCache) {
    return fontCache;
  }
  try {
    const [valveRes, monoRes] = await Promise.all([
      fetch(new URL('/fonts/PPValve-PlainMedium.ttf', baseUrl).toString()),
      fetch(new URL('/fonts/PPFraktionMono-Regular.ttf', baseUrl).toString()),
    ]);
    if (!valveRes.ok || !monoRes.ok) {
      logger.error('Failed to fetch fonts');
      return { valve: new ArrayBuffer(0), mono: new ArrayBuffer(0) };
    }
    fontCache = {
      valve: await valveRes.arrayBuffer(),
      mono: await monoRes.arrayBuffer(),
    };
    return fontCache;
  } catch (error) {
    logger.error('Error loading fonts for OG image:', error);
    return { valve: new ArrayBuffer(0), mono: new ArrayBuffer(0) };
  }
}

// Sanitize token symbols for OG image rendering (Satori doesn't support all Unicode)
function sanitizeSymbol(symbol: string): string {
  // Replace known problematic Unicode characters
  return symbol
    .replace(/₮/g, 'T') // Mongolian Tugrik sign used in USDT
    .replace(/[^\x20-\x7E]/g, ''); // Remove any other non-ASCII characters
}

/**
 * Parse warp route message body to extract recipient and amount.
 * Edge-compatible implementation matching @hyperlane-xyz/utils parseWarpRouteMessage.
 *
 * The amount in the message body depends on the token standard:
 * - If scale is explicitly set, amount = localAmount * scale
 * - Cosmos standards: amount is in origin token's native decimals (no normalization)
 * - EVM/Sealevel standards: amount may be normalized to wire decimals (max in route)
 */
function parseWarpMessageBody(body: string): { recipient: string; amount: bigint } | null {
  try {
    // Remove 0x prefix if present
    const hex = body.startsWith('0x') ? body.slice(2) : body;
    // Need at least 64 bytes (128 hex chars) for recipient (32) + amount (32)
    if (hex.length < 128) return null;

    // First 32 bytes (64 hex chars) = recipient (kept as full 32-byte hex)
    const recipient = '0x' + hex.slice(0, 64);

    // Next 32 bytes = amount (uint256)
    const amountHex = hex.slice(64, 128);
    const amount = BigInt('0x' + amountHex);

    return { recipient, amount };
  } catch {
    return null;
  }
}

// Format token amount from wei to human-readable string
function formatTokenAmount(amountWei: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amountWei / divisor;
  const fractionalPart = amountWei % divisor;

  if (fractionalPart === BigInt(0)) {
    return integerPart.toString();
  }

  // Pad fractional part with leading zeros, limit to 6 decimal places
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmed = fractionalStr.slice(0, 6).replace(/0+$/, '');

  if (trimmed === '') {
    return integerPart.toString();
  }

  return `${integerPart}.${trimmed}`;
}
function getWarpTransferDetails(
  messageData: MessageOGData,
  originChainName: string,
  destChainName: string,
  warpRouteMap: WarpRouteMap,
): WarpTransferDetails | null {
  if (!messageData.body) return null;

  const originChainTokens = warpRouteMap.get(originChainName);
  if (!originChainTokens) return null;

  // Sender/recipient are bytes32 hex; warp route map keys are also normalized hex
  const normalizedSender = normalizeAddressToHex(messageData.sender);

  const originToken = originChainTokens.get(normalizedSender);
  if (!originToken) return null;

  const normalizedRecipient = normalizeAddressToHex(messageData.recipient);

  const destChainTokens = warpRouteMap.get(destChainName);
  const destToken = destChainTokens?.get(normalizedRecipient);

  const parsed = parseWarpMessageBody(messageData.body);
  if (!parsed) return null;

  const effectiveDecimals = getEffectiveDecimals(originToken, destToken);

  const amountParts = getWarpRouteAmountParts(parsed.amount, {
    decimals: effectiveDecimals,
    scale: originToken.scale,
  });
  const formattedAmount = formatTokenAmount(amountParts.amount, amountParts.decimals);

  return {
    token: originToken,
    amount: formatAmountWithCommas(formattedAmount),
  };
}

// Get chain logo URL from registry CDN
function getChainLogoUrl(chainName: string): string {
  return `${links.imgPath}/chains/${chainName}/logo.svg`;
}

// Parse delivery latency string to total seconds
function parseLatencySeconds(latency: string): number {
  const parts = latency.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// Format delivery latency string (e.g., "00:01:32" -> "1m 32s")
function formatDeliveryLatency(latency: string): string {
  const parts = latency.split(':');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default async function handler(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const messageId = searchParams.get('messageId');

  const fonts = await loadFonts(origin);

  const imageOptions = {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'PPValve',
        data: fonts.valve,
        style: 'normal' as const,
        weight: 500 as const,
      },
      {
        name: 'PPFraktionMono',
        data: fonts.mono,
        style: 'normal' as const,
        weight: 400 as const,
      },
    ],
  };

  if (!messageId) {
    return new ImageResponse(<DefaultOGImage origin={origin} />, imageOptions);
  }

  const [messageData, domainNames, chainMetadata, warpRouteMap] = await Promise.all([
    fetchMessageForOG(messageId),
    fetchDomainNames(),
    fetchChainMetadata(),
    fetchWarpRouteMap(),
  ]);

  if (!messageData) {
    return new ImageResponse(<DefaultOGImage origin={origin} />, imageOptions);
  }

  const originChainName =
    domainNames.get(messageData.originDomainId) || `Domain ${messageData.originDomainId}`;
  const destChainName =
    domainNames.get(messageData.destinationDomainId) || `Domain ${messageData.destinationDomainId}`;

  // Get display names from chain metadata
  const originDisplayName = getChainDisplayName(originChainName, chainMetadata);
  const destDisplayName = getChainDisplayName(destChainName, chainMetadata);

  const warpTransfer = getWarpTransferDetails(
    messageData,
    originChainName,
    destChainName,
    warpRouteMap,
  );

  const shortMsgId = `${messageData.msgId.slice(0, 10)}...${messageData.msgId.slice(-8)}`;
  const statusColor = messageData.status === 'Delivered' ? '#10b981' : '#f59e0b';
  const statusBgColor =
    messageData.status === 'Delivered' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
  const formattedDate = new Date(messageData.timestamp)
    .toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(/,/g, '');

  const formattedLatency = messageData.deliveryLatency
    ? formatDeliveryLatency(messageData.deliveryLatency)
    : null;
  const latencyColor = messageData.deliveryLatency
    ? parseLatencySeconds(messageData.deliveryLatency) < 300
      ? '#10b981'
      : '#94A3B8'
    : '#94A3B8';

  const originChainLogo = getChainLogoUrl(originChainName);
  const destChainLogo = getChainLogoUrl(destChainName);

  // Extract colors from chain logos in parallel
  const [originColorsRaw, destColorsRaw] = await Promise.all([
    extractChainColors(originChainLogo, originChainName),
    extractChainColors(destChainLogo, destChainName),
  ]);

  // Adjust colors for dark background visibility
  const originColors: ChainColors = originColorsRaw
    ? {
        primary: adjustColorForBackground(originColorsRaw.primary),
        secondary: originColorsRaw.secondary
          ? adjustColorForBackground(originColorsRaw.secondary)
          : null,
      }
    : DEFAULT_CHAIN_COLORS;
  const destColors: ChainColors = destColorsRaw
    ? {
        primary: adjustColorForBackground(destColorsRaw.primary),
        secondary: destColorsRaw.secondary
          ? adjustColorForBackground(destColorsRaw.secondary)
          : null,
      }
    : DEFAULT_CHAIN_COLORS;

  // Background image URL - using the same background as the explorer
  const backgroundUrl = `${origin}/images/background.svg`;

  return new ImageResponse(
    (
      <div
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% 100%, #2d1145 0%, #1a0a28 50%, #0d0612 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 64px',
          fontFamily: 'PPValve, sans-serif',
          position: 'relative',
        }}
      >
        {/* Sparkle background */}
        <img
          src={backgroundUrl}
          style={{
            position: 'absolute',
            top: '-75%',
            left: '-75%',
            width: '250%',
            height: '250%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />

        {/* Top decorative line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #9A0DFF 0%, #FF4FE9 50%, #9A0DFF 100%)',
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src={`${origin}/images/hyperlane-logo-color.svg`}
              width="44"
              height="40"
              alt=""
              style={{ marginRight: '16px' }}
            />
            <span
              style={{ color: 'white', fontSize: '42px', fontWeight: 600, letterSpacing: '-0.5px' }}
            >
              {APP_NAME}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: statusBgColor,
              padding: '14px 24px',
              borderRadius: '28px',
              border: `1px solid ${statusColor}`,
            }}
          >
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: statusColor,
              }}
            />
            <span style={{ color: statusColor, fontSize: '28px', fontWeight: 500 }}>
              {messageData.status}
            </span>
          </div>
        </div>

        {/* Chain Route - Main Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '32px',
            }}
          >
            {/* Origin Chain Box */}
            <div
              style={{
                background: `linear-gradient(135deg, ${originColors.primary}15 0%, ${originColors.secondary || originColors.primary}08 100%)`,
                border: `1px solid ${originColors.primary}30`,
                borderRadius: '20px',
                padding: '28px 48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: '280px',
              }}
            >
              <span
                style={{
                  color: originColors.primary,
                  fontSize: '21px',
                  fontWeight: 500,
                  marginBottom: '12px',
                  letterSpacing: '1px',
                  fontFamily: 'PPFraktionMono, monospace',
                }}
              >
                FROM
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img src={originChainLogo} alt="" style={{ height: '56px' }} />
                <span
                  style={{
                    color: 'white',
                    fontSize: '46px',
                    fontWeight: 600,
                  }}
                >
                  {originDisplayName}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img
                src={`${origin}/images/arrow-right-gradient.svg`}
                width="72"
                height="36"
                alt=""
              />
            </div>

            {/* Destination Chain Box */}
            <div
              style={{
                background: `linear-gradient(135deg, ${destColors.secondary || destColors.primary}08 0%, ${destColors.primary}15 100%)`,
                border: `1px solid ${destColors.primary}30`,
                borderRadius: '20px',
                padding: '28px 48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: '280px',
              }}
            >
              <span
                style={{
                  color: destColors.primary,
                  fontSize: '21px',
                  fontWeight: 500,
                  marginBottom: '12px',
                  letterSpacing: '1px',
                  fontFamily: 'PPFraktionMono, monospace',
                }}
              >
                TO
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img src={destChainLogo} alt="" style={{ height: '56px' }} />
                <span
                  style={{
                    color: 'white',
                    fontSize: '46px',
                    fontWeight: 600,
                  }}
                >
                  {destDisplayName}
                </span>
              </div>
            </div>
          </div>

          {/* Warp transfer details row */}
          {warpTransfer && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '32px',
                gap: '14px',
              }}
            >
              {warpTransfer.token.logoURI && (
                <img
                  src={warpTransfer.token.logoURI}
                  height="64"
                  alt=""
                  style={{ height: '64px' }}
                />
              )}
              <span
                style={{
                  color: '#94A3B8',
                  fontSize: '50px',
                  fontWeight: 500,
                }}
              >
                {warpTransfer.amount} {sanitizeSymbol(warpTransfer.token.symbol)}
              </span>
            </div>
          )}
        </div>

        {/* Footer with ID, delivery time, and timestamp */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(154, 13, 255, 0.2)',
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}
          >
            <span
              style={{
                color: '#6B7280',
                fontSize: '18px',
                marginBottom: '8px',
                letterSpacing: '0.5px',
              }}
            >
              MESSAGE ID
            </span>
            <span
              style={{
                color: '#94A3B8',
                fontSize: '26px',
                fontFamily: 'PPFraktionMono, monospace',
                background: 'rgba(154, 13, 255, 0.11)',
                padding: '8px 16px',
                borderRadius: '10px',
              }}
            >
              {shortMsgId}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            {formattedLatency ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span
                  style={{
                    color: '#6B7280',
                    fontSize: '18px',
                    marginBottom: '8px',
                    letterSpacing: '0.5px',
                  }}
                >
                  DELIVERY TIME
                </span>
                <span
                  style={{
                    color: latencyColor,
                    fontSize: '26px',
                    fontWeight: 500,
                    fontFamily: 'PPFraktionMono, monospace',
                    padding: '8px 16px',
                  }}
                >
                  {formattedLatency}
                </span>
              </div>
            ) : null}
          </div>

          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 1 }}
          >
            <span
              style={{
                color: '#6B7280',
                fontSize: '18px',
                marginBottom: '8px',
                letterSpacing: '0.5px',
              }}
            >
              SENT
            </span>
            <span
              style={{
                color: '#94A3B8',
                fontSize: '26px',
                fontFamily: 'PPFraktionMono, monospace',
                background: 'rgba(154, 13, 255, 0.11)',
                padding: '8px 16px',
                borderRadius: '10px',
              }}
            >
              {formattedDate}
            </span>
          </div>
        </div>
      </div>
    ),
    imageOptions,
  );
}

function DefaultOGImage({ origin }: { origin: string }) {
  return (
    <div
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 50% 100%, #2d1145 0%, #1a0a28 50%, #0d0612 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'PPValve, sans-serif',
      }}
    >
      {/* Top decorative line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #9A0DFF 0%, #FF4FE9 50%, #9A0DFF 100%)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        <img src={`${origin}/images/hyperlane-logo-color.svg`} width="140" height="126" alt="" />
        <span
          style={{
            color: 'white',
            fontSize: '64px',
            fontWeight: 600,
            letterSpacing: '-1px',
          }}
        >
          {APP_NAME}
        </span>
        <span style={{ color: '#6B7280', fontSize: '28px' }}>{APP_DESCRIPTION}</span>
      </div>
    </div>
  );
}
