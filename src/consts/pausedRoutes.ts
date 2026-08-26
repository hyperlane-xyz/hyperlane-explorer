import type { MessageStub } from '../types';

interface RouteEndpoint {
  domainId: number;
  address: string;
}

export interface PausedRoute {
  name: string;
  endpoints: readonly [RouteEndpoint, RouteEndpoint];
}

// Route endpoint pairs that are temporarily paused due to security incidents.
export const pausedRoutes = [
  {
    name: 'Infinite Trading Protocol',
    endpoints: [
      { domainId: 10, address: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b' },
      { domainId: 8453, address: '0xba8cd87120aca631f59231f9fd6c5469bbee3440' },
    ],
  },
  {
    name: 'Nesa',
    endpoints: [
      { domainId: 1, address: '0x230f1e241c621d5af670dad83ebcdd18971e2995' },
      { domainId: 41443, address: '0xeec6574eabba52bac3f0277f2cd5ac7e67197886' },
    ],
  },
] as const satisfies readonly PausedRoute[];

type MessageRoute = Pick<
  MessageStub,
  'originDomainId' | 'destinationDomainId' | 'sender' | 'recipient'
>;

export function isRoutePaused(message: MessageRoute): boolean {
  return pausedRoutes.some(({ endpoints: [first, second] }) => {
    const matchesForward =
      endpointMatches(first, message.originDomainId, message.sender) &&
      endpointMatches(second, message.destinationDomainId, message.recipient);
    const matchesReverse =
      endpointMatches(second, message.originDomainId, message.sender) &&
      endpointMatches(first, message.destinationDomainId, message.recipient);

    return matchesForward || matchesReverse;
  });
}

function endpointMatches(endpoint: RouteEndpoint, domainId: number, address: string): boolean {
  return endpoint.domainId === domainId && endpoint.address.toLowerCase() === address.toLowerCase();
}
