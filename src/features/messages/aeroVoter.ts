import { AbiCoder } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { z } from 'zod';

import { logger } from '../../utils/logger';

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

export type AeroVoterValue = string | boolean | AeroVoterFields | AeroVoterValue[];
export interface AeroVoterFields {
  [key: string]: AeroVoterValue;
}

export interface DecodedAeroVoterMessage {
  messageType: AeroVoterMessageType;
  messageTypeName: string;
  chainNonce: string;
  dispatchedAt: string;
  payload: AeroVoterFields;
}

export interface AeroVoterMessage {
  originDomainId: number;
  destinationDomainId: number;
  sender: string;
  recipient: string;
  body: string;
}

// Aero V3 staging voter adapters, matching the relayer's metadex_staging topology.
const routes = [
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

const uint = z
  .union([z.instanceof(BigNumber), z.number().int().nonnegative()])
  .transform((value) => value.toString());
const snapshot = z.object({ staked: uint, stakeEnd: uint, isPermanent: z.boolean() });
const snapshotAbi = 'tuple(uint128 staked,uint48 stakeEnd,bool isPermanent)';
const allocation = z.object({ gauge: z.string(), allocated: uint, data: z.string() });

// ABI layouts from Aero V3's IVoterCommon and LeafMessageOrchestrator.
const definitions = {
  [AeroVoterMessageType.AllocateChain]: {
    name: 'AllocateChain',
    isStruct: true,
    types: [
      `tuple(uint256 tokenId,uint128 allocationDelta,uint256 emissionsPerVP,${snapshotAbi} snapshot)`,
    ],
    schema: z.object({ tokenId: uint, allocationDelta: uint, emissionsPerVP: uint, snapshot }),
  },
  [AeroVoterMessageType.AllocateGauge]: {
    name: 'AllocateGauge',
    isStruct: true,
    types: [
      `tuple(uint256 tokenId,uint48 expiry,uint256 emissionsPerVP,${snapshotAbi} tokenSnapshot,tuple(address gauge,uint128 allocated,bytes data)[] allocations)`,
    ],
    schema: z.object({
      tokenId: uint,
      expiry: uint,
      emissionsPerVP: uint,
      tokenSnapshot: snapshot,
      allocations: z.array(allocation),
    }),
  },
  [AeroVoterMessageType.ClaimRewards]: {
    name: 'ClaimRewards',
    isStruct: false,
    types: [
      'uint256 tokenId',
      'uint48 expiry',
      'address recipient',
      'tuple(address votingRewardsManager,uint256 maxCheckpoints)[] feeClaims',
      'tuple(address votingRewardsManager,uint256 programId,uint256 maxCheckpoints)[] incentiveClaims',
    ],
    schema: z.object({
      tokenId: uint,
      expiry: uint,
      recipient: z.string(),
      feeClaims: z.array(z.object({ votingRewardsManager: z.string(), maxCheckpoints: uint })),
      incentiveClaims: z.array(
        z.object({ votingRewardsManager: z.string(), programId: uint, maxCheckpoints: uint }),
      ),
    }),
  },
  [AeroVoterMessageType.Redeem]: {
    name: 'Redeem',
    isStruct: true,
    types: ['tuple(uint256 amount,address recipient,uint256 surplusAccrued)'],
    schema: z.object({ amount: uint, recipient: z.string(), surplusAccrued: uint }),
  },
  [AeroVoterMessageType.SetOperator]: {
    name: 'SetOperator',
    isStruct: true,
    types: ['tuple(uint256 tokenId,uint48 expiry,address operator)'],
    schema: z.object({ tokenId: uint, expiry: uint, operator: z.string() }),
  },
  [AeroVoterMessageType.Deallocate]: {
    name: 'Deallocate',
    isStruct: true,
    types: ['tuple(uint256 tokenId,uint128 amount)'],
    schema: z.object({ tokenId: uint, amount: uint }),
  },
  [AeroVoterMessageType.ReduceCooldown]: {
    name: 'ReduceCooldown',
    isStruct: true,
    types: ['tuple(uint256 tokenId,uint48 reduction)'],
    schema: z.object({ tokenId: uint, reduction: uint }),
  },
  [AeroVoterMessageType.EmergencyDeallocate]: {
    name: 'EmergencyDeallocate',
    isStruct: true,
    types: ['tuple(uint256 tokenId,uint128 amount)'],
    schema: z.object({ tokenId: uint, amount: uint }),
  },
};

const messageTypeSchema = z.enum(AeroVoterMessageType);
const coder = new AbiCoder();

export function isAeroVoterMessage(message: AeroVoterMessage) {
  const sender = normalizeAdapter(message.sender);
  const recipient = normalizeAdapter(message.recipient);
  return routes.some(
    (route) =>
      (message.originDomainId === 8453 &&
        message.destinationDomainId === route.leafDomain &&
        sender === route.rootAdapter &&
        recipient === route.leafAdapter) ||
      (message.originDomainId === route.leafDomain &&
        message.destinationDomainId === 8453 &&
        sender === route.leafAdapter &&
        recipient === route.rootAdapter),
  );
}

export function decodeAeroVoterMessage(
  message: AeroVoterMessage,
): DecodedAeroVoterMessage | { error: string } | null {
  if (!isAeroVoterMessage(message)) return null;

  try {
    // MessageOrchestrator packs uint8 type + uint256 nonce + uint48 dispatchedAt.
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(message.body) || message.body.length < 80) {
      throw new Error('Invalid 39-byte voter message header');
    }
    const hex = message.body.slice(2);
    const messageType = messageTypeSchema.parse(Number.parseInt(hex.slice(0, 2), 16));
    const isReturn =
      messageType === AeroVoterMessageType.Redeem ||
      messageType === AeroVoterMessageType.Deallocate;
    if (isReturn !== (message.destinationDomainId === 8453)) {
      throw new Error('Voter message type does not match the adapter direction');
    }

    const definition = definitions[messageType];
    const body = `0x${hex.slice(78)}`;
    const decoded = coder.decode(definition.types, body);
    // Reject truncated, noncanonical or newer layouts rather than mislabeling their fields.
    if (coder.encode(definition.types, decoded).toLowerCase() !== body.toLowerCase()) {
      throw new Error('Unsupported voter payload layout');
    }
    const payload: unknown = definition.isStruct ? decoded[0] : decoded;
    return {
      messageType,
      messageTypeName: definition.name,
      chainNonce: BigInt(`0x${hex.slice(2, 66)}`).toString(),
      dispatchedAt: BigInt(`0x${hex.slice(66, 78)}`).toString(),
      payload: definition.schema.parse(normalizeAbiValue(payload)),
    };
  } catch (error) {
    logger.warn('Unable to decode Aero V3 voter payload', error);
    return {
      error: 'Unable to decode this Aero V3 voter payload. Its raw body is available below.',
    };
  }
}

function normalizeAdapter(address: string) {
  const hex = address.toLowerCase().replace(/^0x/, '');
  return hex.length === 64 && hex.startsWith('0'.repeat(24)) ? hex.slice(24) : hex;
}

// Ethers tuples are arrays with named properties; Zod objects consume the named fields.
function normalizeAbiValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const fields = Object.entries(value).filter(([key]) => !/^\d+$/.test(key));
  return fields.length
    ? Object.fromEntries(fields.map(([key, entry]) => [key, normalizeAbiValue(entry)]))
    : value.map(normalizeAbiValue);
}
