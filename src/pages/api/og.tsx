import { ImageResponse } from '@vercel/og';
import type { NextRequest } from 'next/server';

import { config as appConfig } from '../../consts/config';
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

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get('messageId');

  if (!messageId) {
    return new ImageResponse(<DefaultOGImage />, { width: 1200, height: 630 });
  }

  const [messageData, domainNames] = await Promise.all([
    fetchMessageForOG(messageId),
    fetchDomainNames(),
  ]);

  if (!messageData) {
    return new ImageResponse(<DefaultOGImage />, { width: 1200, height: 630 });
  }

  const originChain = domainNames.get(messageData.originDomainId) || `Domain ${messageData.originDomainId}`;
  const destChain = domainNames.get(messageData.destinationDomainId) || `Domain ${messageData.destinationDomainId}`;
  const shortMsgId = `${messageData.msgId.slice(0, 8)}...${messageData.msgId.slice(-6)}`;
  const statusColor = messageData.status === 'Delivered' ? '#10b981' : '#f59e0b';
  const formattedDate = new Date(messageData.timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #1e293b 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 64px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '20px',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M16 2L4 8v16l12 6 12-6V8L16 2z"
                stroke="white"
                strokeWidth="2"
                fill="none"
              />
              <path d="M16 14v8M12 12l4 4 4-4" stroke="white" strokeWidth="2" fill="none" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: 'white', fontSize: '28px', fontWeight: 700 }}>
              Hyperlane Explorer
            </span>
            <span style={{ color: '#94a3b8', fontSize: '16px' }}>
              Interchain Message
            </span>
          </div>
        </div>

        {/* Chain Route */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: '24px',
          }}
        >
          {/* Origin Chain */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '220px',
            }}
          >
            <span style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>
              FROM
            </span>
            <span style={{ color: 'white', fontSize: '28px', fontWeight: 600, textTransform: 'capitalize' }}>
              {originChain}
            </span>
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <svg width="48" height="24" viewBox="0 0 48 24" fill="none">
              <path
                d="M0 12h44M36 4l8 8-8 8"
                stroke="#60a5fa"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Destination Chain */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '220px',
            }}
          >
            <span style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>
              TO
            </span>
            <span style={{ color: 'white', fontSize: '28px', fontWeight: 600, textTransform: 'capitalize' }}>
              {destChain}
            </span>
          </div>
        </div>

        {/* Footer with status and ID */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: '32px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#64748b', fontSize: '14px', marginBottom: '4px' }}>
              Message ID
            </span>
            <span style={{ color: '#e2e8f0', fontSize: '18px', fontFamily: 'monospace' }}>
              {shortMsgId}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '14px', marginBottom: '4px' }}>
              Sent
            </span>
            <span style={{ color: '#e2e8f0', fontSize: '16px' }}>
              {formattedDate}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: statusColor,
              }}
            />
            <span style={{ color: statusColor, fontSize: '20px', fontWeight: 600 }}>
              {messageData.status}
            </span>
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
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 50%, #1e293b 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '32px',
        }}
      >
        <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 2L4 8v16l12 6 12-6V8L16 2z"
            stroke="white"
            strokeWidth="2"
            fill="none"
          />
          <path d="M16 14v8M12 12l4 4 4-4" stroke="white" strokeWidth="2" fill="none" />
        </svg>
      </div>
      <span style={{ color: 'white', fontSize: '48px', fontWeight: 700, marginBottom: '16px' }}>
        Hyperlane Explorer
      </span>
      <span style={{ color: '#94a3b8', fontSize: '24px' }}>
        The official interchain explorer for the Hyperlane protocol
      </span>
    </div>
  );
}
