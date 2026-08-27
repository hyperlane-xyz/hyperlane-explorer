import type { MessageStub } from '../types';

interface RouteEndpoint {
  domainId: number;
  address: string;
}

export type MessagePauseType = 'chain' | 'route';

export type PauseConfig =
  | { type: 'chain'; domainId: number; link?: string }
  | { type: 'route'; endpoints: readonly RouteEndpoint[]; link?: string };

// Chain configs match either domain; route configs match both endpoints.
export const pauseConfigs: readonly PauseConfig[] = [
  {
    type: 'chain',
    domainId: 1783,
    link: 'https://x.com/KiiChainio/status/2091330990027296992',
  },
  {
    type: 'route',
    link: 'https://x.com/InfiniteTradePr/status/2090409024437039569',
    endpoints: [
      { domainId: 10, address: '0xb231e9c3bc267db389e3bf5d6ab26ca078c6123b' },
      { domainId: 8453, address: '0xba8cd87120aca631f59231f9fd6c5469bbee3440' },
    ],
  },
  {
    type: 'route',
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

export function getMessagePause(message: MessageRoute) {
  const pause = pauseConfigs.find((config) => {
    if (config.type === 'chain') {
      return (
        config.domainId === message.originDomainId ||
        config.domainId === message.destinationDomainId
      );
    }

    const originMatches = config.endpoints.some((endpoint) =>
      endpointMatches(endpoint, message.originDomainId, message.sender),
    );
    const destinationMatches = config.endpoints.some((endpoint) =>
      endpointMatches(endpoint, message.destinationDomainId, message.recipient),
    );

    return originMatches && destinationMatches;
  });

  return pause ? { type: pause.type, link: pause.link } : undefined;
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
