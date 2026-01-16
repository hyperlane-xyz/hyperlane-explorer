import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { APP_DESCRIPTION, APP_NAME } from '../../consts/appMetadata';
import { links } from '../../consts/links';
import {
  fetchDomainNames,
  fetchMessageForOG,
  type MessageOGData,
} from '../../features/messages/queries/serverFetch';
import {
  adjustColorForBackground,
  type ChainColors,
  DEFAULT_CHAIN_COLORS,
  extractChainColors,
} from '../../utils/colorExtraction';
import { logger } from '../../utils/logger';
import {
  fetchChainMetadata,
  fetchWarpRouteMap,
  getChainDisplayName,
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
let fontCache: ArrayBuffer | null = null;

// Load Space Grotesk font for OG images with caching
async function loadFont(baseUrl: string): Promise<ArrayBuffer> {
  if (fontCache) {
    return fontCache;
  }
  try {
    const fontUrl = new URL('/fonts/SpaceGrotesk-Medium.ttf', baseUrl).toString();
    const response = await fetch(fontUrl);
    if (!response.ok) {
      logger.error(`Failed to fetch font: ${response.status} ${response.statusText}`);
      return new ArrayBuffer(0);
    }
    fontCache = await response.arrayBuffer();
    return fontCache;
  } catch (error) {
    logger.error('Error loading font for OG image:', error);
    return new ArrayBuffer(0);
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
 * IMPORTANT: Decimal Scaling in Warp Routes
 * -----------------------------------------
 * The amount in the message body is NORMALIZED to a common decimal format (wire format),
 * which is the max decimals among all tokens in the warp route.
 *
 * EVM Implementation (TokenRouter.sol):
 *   - Uses `scale = 10^(maxDecimals - localDecimals)` set at deployment
 *   - Outbound: `messageAmount = localAmount * scale`
 *   - Inbound: `localAmount = messageAmount / scale`
 *
 * Sealevel Implementation (Rust):
 *   - Stores both `decimals` (local) and `remote_decimals` (wire format)
 *   - Uses convert_decimals() to transform between local and wire formats
 *
 * Example: USDC (6 decimals) bridging to an 18-decimal token
 *   - Wire format = max(6, 18) = 18 decimals
 *   - Scale for USDC = 10^(18-6) = 10^12
 *   - Local amount: 1_000_000 (1 USDC in 6 decimals)
 *   - Wire amount: 1_000_000 * 10^12 = 10^18 (1 USDC in 18 decimals)
 *
 * Example: USDC (6 decimals) bridging to another 6-decimal token
 *   - Wire format = max(6, 6) = 6 decimals
 *   - Scale = 10^(6-6) = 1
 *   - Local amount: 1_000_000 (1 USDC)
 *   - Wire amount: 1_000_000 (unchanged)
 *
 * We determine wireDecimals by finding the max decimals among all tokens in each
 * warp route config (see yamlParsing.ts). This matches how the contracts calculate scale.
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

// Get warp transfer details if this is a warp route message
function getWarpTransferDetails(
  messageData: MessageOGData,
  originChainName: string,
  warpRouteMap: WarpRouteMap,
): WarpTransferDetails | null {
  if (!messageData.body) return null;

  // The sender is the warp router contract on the origin chain
  const chainTokens = warpRouteMap.get(originChainName);
  if (!chainTokens) return null;

  // Look up token by sender address (lowercase for case-insensitive matching)
  const token = chainTokens.get(messageData.sender.toLowerCase());
  if (!token) return null;

  const parsed = parseWarpMessageBody(messageData.body);
  if (!parsed) return null;

  return {
    token,
    // Use wireDecimals (max decimals in this warp route) since message amounts are scaled
    amount: formatTokenAmount(parsed.amount, token.wireDecimals),
  };
}

// Get chain logo URL from registry CDN
function getChainLogoUrl(chainName: string): string {
  return `${links.imgPath}/chains/${chainName}/logo.svg`;
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

  // Load font from public folder
  const fontData = await loadFont(origin);

  const imageOptions = {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'SpaceGrotesk',
        data: fontData,
        style: 'normal' as const,
        weight: 500 as const,
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

  // Check if this is a warp route transfer
  const warpTransfer = getWarpTransferDetails(messageData, originChainName, warpRouteMap);

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
          background: '#0E1320',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 64px',
          fontFamily: 'SpaceGrotesk, sans-serif',
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
            background: 'linear-gradient(90deg, #2362C1 0%, #5F8AFA 50%, #2362C1 100%)',
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
              style={{ color: 'white', fontSize: '48px', fontWeight: 600, letterSpacing: '-0.5px' }}
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
                }}
              >
                FROM
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img src={originChainLogo} alt="" style={{ height: '56px' }} />
                <span
                  style={{
                    color: 'white',
                    fontSize: '54px',
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
                }}
              >
                TO
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img src={destChainLogo} alt="" style={{ height: '56px' }} />
                <span
                  style={{
                    color: 'white',
                    fontSize: '54px',
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
              <span style={{ color: '#94A3B8', fontSize: '57px', fontWeight: 500 }}>
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
            alignItems: 'flex-end',
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(95, 138, 250, 0.2)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                color: '#6B7280',
                fontSize: '24px',
                marginBottom: '8px',
                letterSpacing: '0.5px',
              }}
            >
              MESSAGE ID
            </span>
            <span
              style={{
                color: '#94A3B8',
                fontSize: '32px',
                fontFamily: 'monospace',
                background: 'rgba(35, 98, 193, 0.15)',
                padding: '8px 16px',
                borderRadius: '10px',
              }}
            >
              {shortMsgId}
            </span>
          </div>

          {formattedLatency && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                style={{
                  color: '#6B7280',
                  fontSize: '24px',
                  marginBottom: '8px',
                  letterSpacing: '0.5px',
                }}
              >
                DELIVERY TIME
              </span>
              <span style={{ color: '#10b981', fontSize: '32px', fontWeight: 500 }}>
                {formattedLatency}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span
              style={{
                color: '#6B7280',
                fontSize: '24px',
                marginBottom: '8px',
                letterSpacing: '0.5px',
              }}
            >
              SENT
            </span>
            <span style={{ color: '#94A3B8', fontSize: '32px' }}>{formattedDate}</span>
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
        background: '#0E1320',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'SpaceGrotesk, sans-serif',
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
          background: 'linear-gradient(90deg, #2362C1 0%, #5F8AFA 50%, #2362C1 100%)',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
        <img src={`${origin}/images/hyperlane-logo-color.svg`} width="140" height="126" alt="" />
        <span
          style={{
            color: 'white',
            fontSize: '72px',
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
