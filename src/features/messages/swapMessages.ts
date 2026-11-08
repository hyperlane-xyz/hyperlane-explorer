import {
  arbitrumAddresses,
  arcAddresses,
  baseAddresses,
  bscAddresses,
  ethereumAddresses,
  inkAddresses,
  optimismAddresses,
  polygonAddresses,
  robinhoodAddresses,
  tronAddresses,
  unichainAddresses,
} from '@hyperlane-xyz/registry';
import { addressToBytes32 } from '@hyperlane-xyz/utils';

import type { MessageStub } from '../../types';

export type SwapMessage = Pick<
  MessageStub,
  'msgId' | 'body' | 'sender' | 'recipient' | 'originDomainId' | 'destinationDomainId'
> & { origin: Pick<MessageStub['origin'], 'hash'> };
export interface SwapApplication {
  name: 'MetaSwap' | 'HyperSwap';
  stage: 'Commit' | 'Reveal' | 'Bridge';
}

// Use the registry's ICA endpoints: MetaSwap and HyperSwap share this transport.
const routers: Record<number, Record<string, unknown>> = {
  1: ethereumAddresses,
  10: optimismAddresses,
  56: bscAddresses,
  130: unichainAddresses,
  137: polygonAddresses,
  8453: baseAddresses,
  42161: arbitrumAddresses,
  57073: inkAddresses,
  4663: robinhoodAddresses,
  5042: arcAddresses,
  728126428: tronAddresses,
};
// Aero SDK META_ROUTER_ADDRESS (including historical staging), and the HyperSwap
// UniversalRouter deployments from universal-router-engine/src/config/chains.ts.
const owners: Record<string, SwapApplication['name']> = Object.fromEntries(
  (
    [
      ['0x0fef9e88a7b76bcdbf451780c6774fe32965ee98', 'MetaSwap'],
      ['0xcde7a7b710c2dfb059af838f755fe25037ba30d3', 'MetaSwap'],
      ['0x52dd779c1b5eeb54d5f218efa72d52117ca04115', 'HyperSwap'],
      ['0x2b4de500c70caf268417736ab65fc7865bdcec20', 'HyperSwap'],
    ] as const
  ).map(([address, app]) => [addressToBytes32(address).toLowerCase(), app]),
);

function canonical(address: string) {
  try {
    return addressToBytes32(address).toLowerCase();
  } catch {
    return null;
  }
}

export function readSwapEnvelope(message: SwapMessage) {
  if (!/^0x[0-9a-f]+$/i.test(message.body)) return null;
  const hex = message.body.slice(2).toLowerCase();
  const stage: SwapApplication['stage'] | null =
    hex.startsWith('01') && hex.length === 258
      ? 'Commit'
      : hex.startsWith('02') && hex.length === 130
        ? 'Reveal'
        : null;
  if (!stage) return null;
  const sender = canonical(message.sender);
  const recipient = canonical(message.recipient);
  const matches = (domain: number, address: string | null) =>
    address &&
    ['interchainAccountRouter', 'interchainAccountRouterV3'].some((field) => {
      const router = routers[domain]?.[field];
      return typeof router === 'string' && canonical(router) === address;
    });
  if (!matches(message.originDomainId, sender) || !matches(message.destinationDomainId, recipient))
    return null;
  const commitment = stage === 'Commit' ? hex.slice(194) : hex.slice(66);
  const key = [
    message.originDomainId,
    message.destinationDomainId,
    sender,
    recipient,
    message.origin.hash.toLowerCase(),
    commitment,
  ].join(':');
  return { stage, key, app: stage === 'Commit' ? owners[`0x${hex.slice(2, 66)}`] : undefined };
}

export function classifySwapMessages(
  messages: SwapMessage[],
  bridgeMessageIds: ReadonlySet<string> = new Set(),
) {
  const parsed = messages.map((message) => ({ message, envelope: readSwapEnvelope(message) }));
  const commitments = new Map<string, SwapApplication['name'] | null>();
  const bridgeApps = new Map<string, SwapApplication['name'] | null>();
  const bridgeKey = (message: SwapMessage) =>
    `${message.originDomainId}:${message.destinationDomainId}:${message.origin.hash.toLowerCase()}`;
  for (const { message, envelope } of parsed) {
    if (envelope?.stage !== 'Commit') continue;
    const app = envelope.app ?? null;
    const route = bridgeKey(message);
    bridgeApps.set(route, bridgeApps.has(route) && bridgeApps.get(route) !== app ? null : app);
    // An ambiguous commitment cannot identify an ownerless reveal safely.
    commitments.set(
      envelope.key,
      commitments.has(envelope.key) && commitments.get(envelope.key) !== app ? null : app,
    );
  }
  const result = new Map<string, SwapApplication>();
  for (const { message, envelope } of parsed) {
    if (!envelope) {
      const name = bridgeMessageIds.has(message.msgId) && bridgeApps.get(bridgeKey(message));
      if (name) result.set(message.msgId, { name, stage: 'Bridge' });
      continue;
    }
    const name = envelope.stage === 'Commit' ? envelope.app : commitments.get(envelope.key);
    if (name) result.set(message.msgId, { name, stage: envelope.stage });
  }
  return result;
}
