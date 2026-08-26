import type { MessageStub } from '../types';

interface RouteEndpoint {
  domainId: number;
  address: string;
}

interface PauseConfig {
  link?: string;
}

export interface PausedChain extends PauseConfig {
  domainId: number;
}

export interface PausedRoute extends PauseConfig {
  endpoints: readonly RouteEndpoint[];
}

// Chains that are halted entirely. A message matches when either domain is listed.
export const pausedChains: readonly PausedChain[] = [
  {
    domainId: 1783,
    link: 'https://x.com/KiiChainio/status/2091330990027296992',
  },
];

// Route endpoint groups that are temporarily paused due to security incidents.
// A message matches when both its origin and destination endpoints belong to one group.
export const pausedRoutes: readonly PausedRoute[] = [
  {
    link: 'https://x.com/InfiniteTradePr/status/2090409024437039569',
    endpoints: [
      { domainId: 10, address: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b' },
      { domainId: 8453, address: '0xba8cd87120aca631f59231f9fd6c5469bbee3440' },
    ],
  },
  {
    link: 'https://x.com/nesaorg/status/2091915864497066077',
    endpoints: [
      { domainId: 42161, address: '0xef9295afcff293956e8b149b33449f246f6f107d' },
      { domainId: 8453, address: '0x87ea09fe8d9dc6115086f5e0a30ca6750a997f1c' },
      { domainId: 56, address: '0x3131f6b80c26936ab03f7d9d29eb4ddf36ac3fb5' },
      { domainId: 1, address: '0x230f1e241c621d5af670dad83ebcdd18971e2995' },
      { domainId: 999, address: '0xd1b6443d49156b66e7bd8a37673511be68bfa459' },
      { domainId: 41443, address: '0xeec6574eabba52bac3f0277f2cd5ac7e67197886' },
      { domainId: 1399811149, address: 'Ht37Rn665vxVD4mChW7Qf9r5MnGJQQwLAdfBZzpoKqTp' },
    ],
  },
];

type MessageRoute = Pick<
  MessageStub,
  'originDomainId' | 'destinationDomainId' | 'sender' | 'recipient'
>;

export type MessagePauseType = 'chain' | 'route';

export interface MessagePause {
  type: MessagePauseType;
  link?: string;
}

export function getMessagePause(message: MessageRoute): MessagePause | undefined {
  const pausedChain = pausedChains.find(
    ({ domainId }) =>
      domainId === message.originDomainId || domainId === message.destinationDomainId,
  );
  if (pausedChain) return { type: 'chain', link: pausedChain.link };

  const pausedRoute = pausedRoutes.find(({ endpoints }) => {
    const originMatches = endpoints.some((endpoint) =>
      endpointMatches(endpoint, message.originDomainId, message.sender),
    );
    const destinationMatches = endpoints.some((endpoint) =>
      endpointMatches(endpoint, message.destinationDomainId, message.recipient),
    );

    return originMatches && destinationMatches;
  });

  return pausedRoute ? { type: 'route', link: pausedRoute.link } : undefined;
}

export function getMessagePauseType(message: MessageRoute): MessagePauseType | undefined {
  return getMessagePause(message)?.type;
}

function endpointMatches(endpoint: RouteEndpoint, domainId: number, address: string): boolean {
  return endpoint.domainId === domainId && addressesEqual(endpoint.address, address);
}

function addressesEqual(first: string, second: string): boolean {
  if (/^0x/i.test(first) && /^0x/i.test(second)) {
    return first.toLowerCase() === second.toLowerCase();
  }

  return first === second;
}
