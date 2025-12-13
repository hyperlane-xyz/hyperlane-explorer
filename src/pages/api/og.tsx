import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { config as appConfig } from '../../consts/config';
import { links } from '../../consts/links';
import { messageStubFragment, MessageStubEntry } from '../../features/messages/queries/fragments';

export const config = {
  runtime: 'edge',
};

// Simple bytea conversion that doesn't need the full encoding module
function stringToPostgresBytea(hexString: string): string {
  const trimmed = hexString.replace(/^0x/i, '').toLowerCase();
  return `\\x${trimmed}`;
}

function postgresByteaToHex(byteString: string): string {
  if (!byteString || byteString.length < 4) return '';
  return '0x' + byteString.substring(2);
}

interface MessageOGData {
  msgId: string;
  status: 'Delivered' | 'Pending';
  originDomainId: number;
  destinationDomainId: number;
  timestamp: number;
  sender: string;
  recipient: string;
  body: string | null;
  deliveryLatency: string | null;
}

async function fetchMessageForOG(messageId: string): Promise<MessageOGData | null> {
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
      msgId: postgresByteaToHex(msg.msg_id),
      status: msg.is_delivered ? 'Delivered' : 'Pending',
      originDomainId: msg.origin_domain_id,
      destinationDomainId: msg.destination_domain_id,
      timestamp: new Date(msg.send_occurred_at + 'Z').getTime(),
      sender: postgresByteaToHex(msg.sender),
      recipient: postgresByteaToHex(msg.recipient),
      body: msg.message_body ? postgresByteaToHex(msg.message_body) : null,
      deliveryLatency: msg.delivery_latency,
    };
  } catch {
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
  } catch {
    return new Map();
  }
}

// Warp route token info
interface WarpToken {
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
  chainName: string;
  addressOrDenom: string;
}

// Map of chainName -> lowercase address -> token info
type WarpRouteMap = Map<string, Map<string, WarpToken>>;

// Fetch warp route configs from registry
async function fetchWarpRouteMap(): Promise<WarpRouteMap> {
  const map: WarpRouteMap = new Map();

  try {
    const response = await fetch(
      `${links.imgPath}/deployments/warp_routes/warpRouteConfigs.yaml`,
    );
    if (!response.ok) return map;

    const yaml = await response.text();

    // Split YAML into token entries (each starts with "    - addressOrDenom:")
    const tokenBlocks = yaml.split(/^    - addressOrDenom:/gm).slice(1);

    for (const block of tokenBlocks) {
      // Parse each field independently since order varies
      const addressMatch = block.match(/^\s*"?([^"\n]+)"?/);
      const chainMatch = block.match(/^\s+chainName:\s*(\w+)/m);
      const decimalsMatch = block.match(/^\s+decimals:\s*(\d+)/m);
      const logoMatch = block.match(/^\s+logoURI:\s*([^\n]+)/m);
      const nameMatch = block.match(/^\s+name:\s*([^\n]+)/m);
      const symbolMatch = block.match(/^\s+symbol:\s*([^\n]+)/m);

      if (addressMatch && chainMatch && decimalsMatch && symbolMatch) {
        const addressOrDenom = addressMatch[1].trim();
        const chainName = chainMatch[1].trim();
        const decimals = parseInt(decimalsMatch[1], 10);
        const logoURI = logoMatch?.[1]?.trim() || '';
        const name = nameMatch?.[1]?.trim() || '';
        const symbol = symbolMatch[1].trim();

        if (!map.has(chainName)) {
          map.set(chainName, new Map());
        }

        const chainMap = map.get(chainName)!;
        const normalizedAddress = addressOrDenom.toLowerCase();

        chainMap.set(normalizedAddress, {
          addressOrDenom,
          chainName,
          decimals,
          logoURI: logoURI.startsWith('/') ? `${links.imgPath}${logoURI}` : logoURI,
          name,
          symbol,
        });
      }
    }

    return map;
  } catch {
    return map;
  }
}

// Parse warp route message body to extract amount
// Warp message format: first 32 bytes = recipient, next 32 bytes = amount (big-endian uint256)
function parseWarpMessageBody(body: string): { recipient: string; amount: bigint } | null {
  try {
    // Remove 0x prefix
    const hex = body.replace(/^0x/i, '');

    // Must have at least 64 bytes (recipient + amount)
    if (hex.length < 128) return null;

    const recipient = '0x' + hex.slice(0, 64);
    const amountHex = hex.slice(64, 128);
    const amount = BigInt('0x' + amountHex);

    return { recipient, amount };
  } catch {
    return null;
  }
}

// Format token amount with proper decimals
function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  if (remainder === 0n) {
    return whole.toLocaleString();
  }

  // Format with decimal places
  const remainderStr = remainder.toString().padStart(decimals, '0');
  // Trim trailing zeros but keep at least 2 decimal places for readability
  const trimmed = remainderStr.replace(/0+$/, '').slice(0, 4);

  if (trimmed === '') {
    return whole.toLocaleString();
  }

  return `${whole.toLocaleString()}.${trimmed}`;
}

// Get warp transfer details if this is a warp route message
interface WarpTransferDetails {
  token: WarpToken;
  amount: string;
}

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

  // Parse the message body
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

interface ChainDisplayNames {
  displayName: string;
  displayNameShort?: string;
}

// Fetch all chain metadata from the consolidated registry file
async function fetchAllChainMetadata(): Promise<Map<string, ChainDisplayNames>> {
  const map = new Map<string, ChainDisplayNames>();
  try {
    const response = await fetch(`${links.imgPath}/chains/metadata.yaml`);
    if (!response.ok) return map;

    const yaml = await response.text();

    // Parse YAML by splitting on chain name entries (lines starting with a word at column 0)
    // Each chain section starts with "chainname:" at column 0
    const chainSections = yaml.split(/^(?=\w+:$)/m);

    for (const section of chainSections) {
      const lines = section.trim().split('\n');
      if (lines.length === 0) continue;

      // First line is the chain name
      const chainNameMatch = lines[0].match(/^(\w+):$/);
      if (!chainNameMatch) continue;
      const chainName = chainNameMatch[1];

      // Find displayName and displayNameShort in the section
      const displayNameMatch = section.match(/^\s+displayName:\s*(.+)$/m);
      const displayNameShortMatch = section.match(/^\s+displayNameShort:\s*(.+)$/m);

      if (displayNameMatch) {
        map.set(chainName, {
          displayName: displayNameMatch[1].trim(),
          displayNameShort: displayNameShortMatch?.[1]?.trim(),
        });
      }
    }

    return map;
  } catch {
    return map;
  }
}

// Get display name for chain, preferring displayNameShort
function getChainDisplayName(
  chainName: string,
  chainMetadata: Map<string, ChainDisplayNames>,
): string {
  const metadata = chainMetadata.get(chainName.toLowerCase());
  if (metadata) {
    return metadata.displayNameShort ?? metadata.displayName;
  }
  // Fallback to title case
  return chainName
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get('messageId');

  if (!messageId) {
    return new ImageResponse(<DefaultOGImage />, {
      width: 1200,
      height: 630,
    });
  }

  const [messageData, domainNames, chainMetadata, warpRouteMap] = await Promise.all([
    fetchMessageForOG(messageId),
    fetchDomainNames(),
    fetchAllChainMetadata(),
    fetchWarpRouteMap(),
  ]);

  if (!messageData) {
    return new ImageResponse(<DefaultOGImage />, {
      width: 1200,
      height: 630,
    });
  }

  const originChainName =
    domainNames.get(messageData.originDomainId) || `Domain ${messageData.originDomainId}`;
  const destChainName =
    domainNames.get(messageData.destinationDomainId) ||
    `Domain ${messageData.destinationDomainId}`;

  // Get display names from chain metadata
  const originDisplayName = getChainDisplayName(originChainName, chainMetadata);
  const destDisplayName = getChainDisplayName(destChainName, chainMetadata);

  // Check if this is a warp route transfer
  const warpTransfer = getWarpTransferDetails(messageData, originChainName, warpRouteMap);

  const shortMsgId = `${messageData.msgId.slice(0, 10)}...${messageData.msgId.slice(-8)}`;
  const statusColor = messageData.status === 'Delivered' ? '#10b981' : '#f59e0b';
  const statusBgColor =
    messageData.status === 'Delivered' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)';
  const formattedDate = new Date(messageData.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Format delivery latency (e.g., "00:01:32" -> "1m 32s")
  const formattedLatency = messageData.deliveryLatency
    ? (() => {
        const parts = messageData.deliveryLatency.split(':');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(parts[2], 10);
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
      })()
    : null;

  const originChainLogo = getChainLogoUrl(originChainName.toLowerCase());
  const destChainLogo = getChainLogoUrl(destChainName.toLowerCase());

  // Background image URL - using the same background as the explorer
  const backgroundUrl = 'https://explorer.hyperlane.xyz/images/background.svg';

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
          fontFamily: 'sans-serif',
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
            <svg width="44" height="40" viewBox="0 0 550 494" fill="none" style={{ marginRight: '16px' }}>
              {/* Back chevrons - magenta */}
              <path d="M270.652 0H371.119C384.826 0 397.089 7.95912 401.874 19.9606L490.058 241.148C490.739 242.854 490.747 244.731 490.081 246.443L489.587 247.714L489.582 247.726L401.769 473.524C397.054 485.646 384.726 493.716 370.923 493.716H270.471C264.822 493.716 260.862 488.506 262.724 483.523L353.271 241.148L262.946 10.2988C260.989 5.29678 264.952 0 270.652 0Z" fill="#D631B9"/>
              <path d="M8.39276 0H108.86C122.567 0 134.83 7.95912 139.614 19.9606L227.799 241.148C228.479 242.854 228.487 244.731 227.822 246.443L227.327 247.714L227.322 247.726L139.509 473.524C134.795 485.646 122.467 493.716 108.664 493.716H8.2115C2.56253 493.716 -1.39662 488.506 0.465105 483.523L91.0122 241.148L0.686825 10.2988C-1.27034 5.29678 2.69291 0 8.39276 0Z" fill="#D631B9"/>
              {/* Front chevrons - white */}
              <path d="M328.652 0H429.119C442.826 0 455.089 7.95912 459.874 19.9606L548.058 241.148C548.739 242.854 548.747 244.731 548.081 246.443L547.587 247.714L547.582 247.726L459.769 473.524C455.054 485.646 442.726 493.716 428.923 493.716H328.471C322.822 493.716 318.862 488.506 320.724 483.523L411.271 241.148L320.946 10.2988C318.989 5.29678 322.952 0 328.652 0Z" fill="white"/>
              <path d="M66.3928 0H166.86C180.567 0 192.83 7.95912 197.614 19.9606L285.799 241.148C286.479 242.854 286.487 244.731 285.822 246.443L285.327 247.714L285.322 247.726L197.509 473.524C192.795 485.646 180.467 493.716 166.664 493.716H66.2115C60.5625 493.716 56.6034 488.506 58.4651 483.523L149.012 241.148L58.6868 10.2988C56.7297 5.29678 60.6929 0 66.3928 0Z" fill="white"/>
              {/* Center bar */}
              <path d="M401.826 194H260V301H401.826L425 245.971L401.826 194Z" fill="white"/>
            </svg>
            <span style={{ color: 'white', fontSize: '34px', fontWeight: 600, letterSpacing: '-0.5px' }}>
              Hyperlane Explorer
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: statusBgColor,
              padding: '10px 18px',
              borderRadius: '24px',
              border: `1px solid ${statusColor}`,
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: statusColor,
              }}
            />
            <span style={{ color: statusColor, fontSize: '20px', fontWeight: 500 }}>
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
                style={{ color: '#5F8AFA', fontSize: '14px', fontWeight: 500, marginBottom: '12px', letterSpacing: '1px' }}
              >
                FROM
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={originChainLogo} width="44" height="44" alt="" />
                <span
                  style={{
                    color: 'white',
                    fontSize: '36px',
                    fontWeight: 600,
                  }}
                >
                  {originDisplayName}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <svg width="72" height="36" viewBox="0 0 64 32" fill="none">
                <defs>
                  <linearGradient id="arrowGrad" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#2362C1" />
                    <stop offset="100%" stopColor="#5F8AFA" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 16h56M48 6l8 10-8 10"
                  stroke="url(#arrowGrad)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
                style={{ color: '#5F8AFA', fontSize: '14px', fontWeight: 500, marginBottom: '12px', letterSpacing: '1px' }}
              >
                TO
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={destChainLogo} width="44" height="44" alt="" />
                <span
                  style={{
                    color: 'white',
                    fontSize: '36px',
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
                marginTop: '56px',
                gap: '10px',
              }}
            >
              <img
                src={warpTransfer.token.logoURI}
                width="48"
                height="48"
                alt=""
                style={{ borderRadius: '50%' }}
              />
              <span style={{ color: '#94A3B8', fontSize: '38px', fontWeight: 500 }}>
                {warpTransfer.amount} {warpTransfer.token.symbol}
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
            <span style={{ color: '#6B7280', fontSize: '14px', marginBottom: '6px', letterSpacing: '0.5px' }}>
              MESSAGE ID
            </span>
            <span
              style={{
                color: '#94A3B8',
                fontSize: '20px',
                fontFamily: 'monospace',
                background: 'rgba(35, 98, 193, 0.15)',
                padding: '6px 12px',
                borderRadius: '8px',
              }}
            >
              {shortMsgId}
            </span>
          </div>

          {formattedLatency && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#6B7280', fontSize: '14px', marginBottom: '6px', letterSpacing: '0.5px' }}>
                DELIVERY TIME
              </span>
              <span style={{ color: '#10b981', fontSize: '20px', fontWeight: 500 }}>{formattedLatency}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: '#6B7280', fontSize: '14px', marginBottom: '6px', letterSpacing: '0.5px' }}>
              SENT
            </span>
            <span style={{ color: '#94A3B8', fontSize: '20px' }}>{formattedDate}</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}

function DefaultOGImage() {
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

      <svg width="72" height="78" viewBox="0 0 301 324" fill="none" style={{ marginBottom: '32px' }}>
        <path
          d="M166.2 1h61.2A20 20 0 0 1 246 14L300 158.3a5 5 0 0 1 0 3.4l-.3.9L246 309.8a20 20 0 0 1-18.8 13.2H166a5 5 0 0 1-4.7-6.6l55.2-158.1-55-150.6a5 5 0 0 1 4.7-6.7Z"
          fill="#2362C1"
        />
        <path
          d="M6.3 1h61.3a20 20 0 0 1 18.7 13L140 158.3a5 5 0 0 1 0 3.4l-.3.9-53.5 147.2A20 20 0 0 1 67.4 323H6.2a5 5 0 0 1-4.7-6.6l55.2-158.1L1.7 7.7A5 5 0 0 1 6.2 1Z"
          fill="#2362C1"
        />
        <path d="M204.5 124.5H128v70h76.5l12.5-36-12.5-34Z" fill="#0E1320" />
      </svg>
      <span
        style={{
          color: 'white',
          fontSize: '56px',
          fontWeight: 600,
          marginBottom: '16px',
          letterSpacing: '-1px',
        }}
      >
        Hyperlane Explorer
      </span>
      <span style={{ color: '#6B7280', fontSize: '24px' }}>
        The official interchain explorer for the Hyperlane protocol
      </span>
    </div>
  );
}
