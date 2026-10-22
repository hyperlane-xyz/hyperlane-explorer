import type { MessageStub } from '../types';

export const AERO_VOTER_ROOT_DOMAIN = 8453;

interface AeroVoterRoute {
  leafDomain: number;
  rootAdapter: string;
  leafAdapter: string;
}

type MessageRoute = Pick<
  MessageStub,
  'originDomainId' | 'destinationDomainId' | 'sender' | 'recipient'
>;

// Aero V3 staging voter adapters, matching the relayer's metadex_staging topology.
export const aeroVoterRoutes: readonly AeroVoterRoute[] = [
  {
    leafDomain: 10,
    rootAdapter: '504e81562dafe4efe87a4b3025f805eb0e9c5c15',
    leafAdapter: '1733cd126a227066963e9b636ad49898d1224741',
  },
  {
    leafDomain: 42161,
    rootAdapter: 'afb6d2686b85c795e1b9324d4cbbed269d7f01a8',
    leafAdapter: 'aaa49bd49a9be1eae5534eb35fc2c346afd7ca49',
  },
];

/** Matches both endpoints of a configured voter route, including bytes32 addresses. */
export function isAeroVoterMessage(message: MessageRoute) {
  const sender = normalizeAdapter(message.sender);
  const recipient = normalizeAdapter(message.recipient);
  return aeroVoterRoutes.some(
    (route) =>
      (message.originDomainId === AERO_VOTER_ROOT_DOMAIN &&
        message.destinationDomainId === route.leafDomain &&
        sender === route.rootAdapter &&
        recipient === route.leafAdapter) ||
      (message.originDomainId === route.leafDomain &&
        message.destinationDomainId === AERO_VOTER_ROOT_DOMAIN &&
        sender === route.leafAdapter &&
        recipient === route.rootAdapter),
  );
}

function normalizeAdapter(address: string) {
  const hex = address.toLowerCase().replace(/^0x/, '');
  return hex.length === 64 && hex.startsWith('0'.repeat(24)) ? hex.slice(24) : hex;
}
