import type { MessageStub } from '../types';

export const AERO_VOTER_ROOT_DOMAIN = 8453;

export enum AeroVoterMessageType {
  AllocateChain = 1,
  AllocateGauge = 2,
  ClaimRewards = 3,
  Redeem = 4,
  SetOperator = 5,
  Deallocate = 6,
  ReduceCooldown = 7,
  EmergencyDeallocate = 8,
}

// The first header byte identifies the operation; no ABI decoding needed for table tooltips.
export function getAeroVoterMessageTypeLabel(body: string) {
  const typeByte = body.match(/^0x([0-9a-f]{2})/i)?.[1];
  if (!typeByte) return undefined;
  return AeroVoterMessageType[Number.parseInt(typeByte, 16)]?.replace(/([a-z])([A-Z])/g, '$1 $2');
}

interface AeroVoterRoute {
  leafDomain: number;
  rootAdapter: string;
  leafAdapter: string;
}

type MessageRoute = Pick<
  MessageStub,
  'originDomainId' | 'destinationDomainId' | 'sender' | 'recipient'
>;

// Current adapters verified via Base RootMessageOrchestrator
// 0x4F347Fec2aEb8fdB569045AF4D0806eE7f7F6194.adapters(domain), then
// each adapter's remoteAdapter() and REMOTE_DOMAIN_ID() (2026-11-08).
// Keep the original staging pairs for historical messages.
export const aeroVoterRoutes: readonly AeroVoterRoute[] = [
  {
    leafDomain: 1,
    rootAdapter: '0c54028e2aefdf6e740513655dce88ae63df96c9',
    leafAdapter: '4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14',
  },
  {
    leafDomain: 10,
    rootAdapter: 'e82457ff1049f1f63e51d634d2c96993b841b1cb',
    leafAdapter: '314bdc685ad3426d586860cf909e4d4f0279bf77',
  },
  {
    leafDomain: 42161,
    rootAdapter: 'a365addaa935fd97c0815d41a6375dbb483d5c67',
    leafAdapter: 'e7eb27bf93a7a3caa8b483ec5f5ee6588bfd3886',
  },
  {
    leafDomain: 57073,
    rootAdapter: '5ad9a3920a25caa5abd36cd35f1c57b48793fd03',
    leafAdapter: '4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14',
  },
  {
    leafDomain: 4663,
    rootAdapter: 'd9dc65a40e70517da5f4f5cb1f9e5d4b59aa2910',
    leafAdapter: '4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14',
  },
  {
    leafDomain: 5042,
    rootAdapter: '247c86a3bbd88059aef2e9d3af0e90d2f3f5c8bf',
    leafAdapter: '56632394f866761fd86873e96a567720ce865682',
  },
  {
    leafDomain: 99901,
    rootAdapter: 'c93eb34f4e893cbd6dc4f6530ff06cb1162cbe74',
    leafAdapter: '4aaff8cfb43e2cefbbbf4c133c934db6ba7e4c14',
  },
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
