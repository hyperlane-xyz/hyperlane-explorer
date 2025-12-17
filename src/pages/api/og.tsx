import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { config as appConfig } from '../../consts/config';
import { links } from '../../consts/links';
import {
  postgresByteaToString,
  stringToPostgresBytea,
} from '../../features/messages/queries/encoding';
import { MessageStubEntry, messageStubFragment } from '../../features/messages/queries/fragments';
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

interface MessageOGData {
  msgId: string;
  status: 'Delivered' | 'Pending' | 'Unknown';
  originDomainId: number;
  destinationDomainId: number;
  timestamp: number;
  sender: string;
  recipient: string;
  body: string | null;
  deliveryLatency: string | null;
}

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
  const fontUrl = new URL('/fonts/SpaceGrotesk-Medium.ttf', baseUrl).toString();
  const response = await fetch(fontUrl);
  fontCache = await response.arrayBuffer();
  return fontCache;
}

async function fetchMessageForOG(messageId: string): Promise<MessageOGData | null> {
  // Validate messageId format (must be 0x-prefixed hex string)
  if (!messageId || !/^0x[0-9a-f]+$/i.test(messageId)) return null;
  const identifier = stringToPostgresBytea(messageId);

  const query = `
    query ($identifier: bytea!) @cached(ttl: 5) {
      message_view(
        where: {msg_id: {_eq: $identifier}},
        limit: 1
      ) {
        ${messageStubFragment}
      }
    }
  `;

  try {
    const response = await fetch(appConfig.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { identifier } }),
    });

    if (!response.ok) return null;

    const result = await response.json();
    const messages = result.data?.message_view as MessageStubEntry[] | undefined;

    if (!messages?.length) return null;

    const msg = messages[0];
    return {
      msgId: postgresByteaToString(msg.msg_id),
      status: msg.is_delivered ? 'Delivered' : 'Pending',
      originDomainId: msg.origin_domain_id,
      destinationDomainId: msg.destination_domain_id,
      timestamp: new Date(msg.send_occurred_at + 'Z').getTime(),
      sender: postgresByteaToString(msg.sender),
      recipient: postgresByteaToString(msg.recipient),
      body: msg.message_body ? postgresByteaToString(msg.message_body) : null,
      deliveryLatency: msg.delivery_latency,
    };
  } catch (error) {
    logger.error('Error fetching message for OG:', error);
    return null;
  }
}

async function fetchDomainNames(): Promise<Map<number, string>> {
  const query = `query @cached { domain { id name } }`;

  try {
    const response = await fetch(appConfig.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) return new Map();

    const result = await response.json();
    const domains = result.data?.domain as Array<{ id: number; name: string }> | undefined;

    if (!domains) return new Map();

    const map = new Map<number, string>();
    for (const domain of domains) {
      map.set(domain.id, domain.name);
    }
    return map;
  } catch (error) {
    logger.error('Error fetching domain names:', error);
    return new Map();
  }
}

// Sanitize token symbols for OG image rendering (Satori doesn't support all Unicode)
function sanitizeSymbol(symbol: string): string {
  // Replace known problematic Unicode characters
  return symbol
    .replace(/₮/g, 'T') // Mongolian Tugrik sign used in USDT
    .replace(/[^\x20-\x7E]/g, ''); // Remove any other non-ASCII characters
}

// Parse warp route message body to extract recipient and amount
// This is a simplified version that doesn't depend on @hyperlane-xyz/utils
function parseWarpMessageBody(body: string): { recipient: string; amount: bigint } | null {
  try {
    // Remove 0x prefix if present
    const hex = body.startsWith('0x') ? body.slice(2) : body;
    if (hex.length < 64) return null;

    // First 32 bytes (64 hex chars) = recipient address (right-padded)
    const recipientHex = hex.slice(0, 64);
    const recipient = '0x' + recipientHex.replace(/^0+/, '').padStart(40, '0');

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
    amount: formatTokenAmount(parsed.amount, token.decimals),
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
              Hyperlane Explorer
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
            {/* Origin Chain */}
            <div
              style={{
                background: 'rgba(35, 98, 193, 0.1)',
                border: '1px solid rgba(95, 138, 250, 0.3)',
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
                  color: '#5F8AFA',
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

            {/* Destination Chain */}
            <div
              style={{
                background: 'rgba(35, 98, 193, 0.1)',
                border: '1px solid rgba(95, 138, 250, 0.3)',
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
                  color: '#5F8AFA',
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
              <img src={warpTransfer.token.logoURI} height="64" alt="" style={{ height: '64px' }} />
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
          Hyperlane Explorer
        </span>
        <span style={{ color: '#6B7280', fontSize: '28px' }}>
          The official interchain explorer for the Hyperlane protocol
        </span>
      </div>
    </div>
  );
}
