import { AbiCoder } from '@ethersproject/abi';

import { isAeroVoterMessage } from '../../consts/aeroVoterRoutes';
import { logger } from '../../utils/logger';
import { AeroVoterMessage, AeroVoterMessageType, decodeAeroVoterMessage } from './aeroVoter';

const outbound = {
  originDomainId: 8453,
  destinationDomainId: 42161,
  sender: '0xafb6d2686b85c795e1b9324d4cbbed269d7f01a8',
  recipient: '0xaaa49bd49a9be1eae5534eb35fc2c346afd7ca49',
};

// Real staging payloads; IDs also appear in the PR's manual verification links.
const examples = [
  {
    // 0xa7ea0aea6e3c522d2587396f289d765f6578f87f9917019a441dd25b364a4a0f
    type: AeroVoterMessageType.AllocateChain,
    message: {
      ...outbound,
      body: '0x01000000000000000000000000000000000000000000000000000000000000004100006ad47cad0000000000000000000000000000000000000000000000000000000000000056000000000000000000000000000000000000000000000000016345785d8a00000000000000000000000000000000000000000000000000000000d0c608a7b1cb00000000000000000000000000000000000000000000000002c68af0bb140000000000000000000000000000000000000000000000000000000000006e8fdb800000000000000000000000000000000000000000000000000000000000000000',
    },
    expected: {
      messageTypeName: 'AllocateChain',
      chainNonce: '65',
      dispatchedAt: '1792310445',
      payload: { tokenId: '86', allocationDelta: '100000000000000000' },
    },
  },
  {
    // 0x9e53d535df8aed5f8e1b5f8d43c03ccc2d0055ea8dbcac4911c9e0325d533486
    type: AeroVoterMessageType.AllocateGauge,
    message: {
      ...outbound,
      body: '0x02000000000000000000000000000000000000000000000000000000000000004300006ad5fba300000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000056000000000000000000000000000000000000000000000000000000006ad609b30000000000000000000000000000000000000000000000000000d12e63cd019300000000000000000000000000000000000000000000000002c68af0bb140000000000000000000000000000000000000000000000000000000000006e8fdb80000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000068126c9f5d2cb988148af1b7ea34544f7b67e2ea000000000000000000000000000000000000000000000000016345785d8a00000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000072fa9bfae32e9f1c349beb5721d6814358e1a769000000000000000000000000000000000000000000000000016345785d8a000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000',
    },
    expected: {
      messageTypeName: 'AllocateGauge',
      chainNonce: '67',
      dispatchedAt: '1792408483',
      payload: {
        tokenId: '86',
        allocations: [
          {
            gauge: '0x68126C9F5d2Cb988148AF1B7Ea34544F7B67e2eA',
            allocated: '100000000000000000',
            data: '0x',
          },
          {
            gauge: '0x72fa9bfAe32e9F1C349beb5721D6814358E1a769',
            allocated: '100000000000000000',
            data: '0x',
          },
        ],
      },
    },
  },
  {
    // 0x0acde12aab20bdf4760754391ea45c550d7138815509425de9a0742bb9d25f45
    type: AeroVoterMessageType.ClaimRewards,
    message: {
      ...outbound,
      body: '0x03000000000000000000000000000000000000000000000000000000000000002b00006ad247d10000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000006ad263f1000000000000000000000000100adc36fc4d467b1b2bb5e9697798277205c58300000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000100000000000000000000000041211279ff8b22a8c2714fcc9534155e74a5b7bc000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000',
    },
    expected: {
      messageTypeName: 'ClaimRewards',
      chainNonce: '43',
      dispatchedAt: '1792165841',
      payload: {
        tokenId: '48',
        feeClaims: [
          {
            votingRewardsManager: '0x41211279Ff8B22A8c2714fcc9534155e74A5b7BC',
            maxCheckpoints: '10',
          },
        ],
        incentiveClaims: [],
      },
    },
  },
  {
    // 0x5319a92d2c7af8d8c72e513234e7fbbc2b54cefd301d6a1e92979a6e2b33596a
    type: AeroVoterMessageType.Redeem,
    message: {
      originDomainId: 42161,
      destinationDomainId: 8453,
      sender: '0xaaa49bd49a9be1eae5534eb35fc2c346afd7ca49',
      recipient: '0xafb6d2686b85c795e1b9324d4cbbed269d7f01a8',
      body: '0x04000000000000000000000000000000000000000000000000000000000000001500006ad248190000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000100adc36fc4d467b1b2bb5e9697798277205c5830000000000000000000000000000000000000000000039b2bdfe13a748c3eb99',
    },
    expected: {
      messageTypeName: 'Redeem',
      chainNonce: '21',
      dispatchedAt: '1792165913',
      payload: { amount: '10000000000000000000' },
    },
  },
  {
    // 0x9679cc8f387bd8fd853bea11000239db1aa6be69b6e16f45049af1c599071a51
    type: AeroVoterMessageType.SetOperator,
    message: {
      ...outbound,
      body: '0x05000000000000000000000000000000000000000000000000000000000000002c00006ad248010000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000006ad26421000000000000000000000000100adc36fc4d467b1b2bb5e9697798277205c583',
    },
    expected: {
      messageTypeName: 'SetOperator',
      chainNonce: '44',
      dispatchedAt: '1792165889',
      payload: { operator: '0x100Adc36fC4d467b1b2bb5E9697798277205c583' },
    },
  },
  {
    // 0x87b12d92aebc5dc4caf0a53ed454258cdf2f80c8192736bc319933ce0bb7a3fe
    type: AeroVoterMessageType.Deallocate,
    message: {
      originDomainId: 10,
      destinationDomainId: 8453,
      sender: '0x1733cd126a227066963e9b636ad49898d1224741',
      recipient: '0x504e81562dafe4efe87a4b3025f805eb0e9c5c15',
      body: '0x06000000000000000000000000000000000000000000000000000000000000001b00006ad47c830000000000000000000000000000000000000000000000000000000000000056000000000000000000000000000000000000000000000000016345785d8a0000',
    },
    expected: {
      messageTypeName: 'Deallocate',
      chainNonce: '27',
      dispatchedAt: '1792310403',
      payload: { tokenId: '86', amount: '100000000000000000' },
    },
  },
];

beforeEach(() => jest.spyOn(logger, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

it.each(examples)('decodes captured voter type $type', ({ type, message, expected }) => {
  expect(decodeAeroVoterMessage(message)).toMatchObject({ messageType: type, ...expected });
  expect(logger.warn).not.toHaveBeenCalled();
});

it.each([
  {
    type: AeroVoterMessageType.ReduceCooldown,
    abi: 'tuple(uint256 tokenId,uint48 reduction)',
    key: 'reduction',
  },
  {
    type: AeroVoterMessageType.EmergencyDeallocate,
    abi: 'tuple(uint256 tokenId,uint128 amount)',
    key: 'amount',
  },
])('decodes type $type without losing integer precision', ({ type, abi, key }) => {
  const tokenId = '900719925474099312345';
  const header = `${type.toString(16).padStart(2, '0')}${'9'.padStart(64, '0')}${'6ad5fba3'.padStart(12, '0')}`;
  const payload = new AbiCoder().encode([abi], [[tokenId, '3600']]);
  expect(
    decodeAeroVoterMessage({ ...outbound, body: `0x${header}${payload.slice(2)}` }),
  ).toMatchObject({
    messageType: type,
    chainNonce: '9',
    payload: { tokenId, [key]: '3600' },
  });
});

function example(type: AeroVoterMessageType): AeroVoterMessage {
  const entry = examples.find((entry) => entry.type === type);
  if (!entry) throw new Error(`Missing example for ${type}`);
  return entry.message;
}

it('matches padded adapter addresses and both route directions', () => {
  for (const { message } of examples) {
    expect(
      isAeroVoterMessage({
        ...message,
        sender: `0x${message.sender.slice(2).toUpperCase().padStart(64, '0')}`,
        recipient: `0x${message.recipient.slice(2).toUpperCase().padStart(64, '0')}`,
      }),
    ).toBe(true);
  }
});

it.each([
  { sender: `0x${'1'.repeat(40)}` },
  { recipient: `0x${'1'.repeat(40)}` },
  { originDomainId: 1 },
  { destinationDomainId: 1 },
])('ignores messages outside the configured routes: %j', (overrides) => {
  const message = { ...example(AeroVoterMessageType.AllocateChain), ...overrides };
  expect(isAeroVoterMessage(message)).toBe(false);
  expect(decodeAeroVoterMessage(message)).toBeNull();
  expect(logger.warn).not.toHaveBeenCalled();
});

it.each(['0x', '0xzz', '0x01', `0x${'00'.repeat(40)}`, `0x${'09'.repeat(40)}`])(
  'reports malformed or unsupported voter bodies: %s',
  (body) => {
    expect(decodeAeroVoterMessage({ ...outbound, body })).toEqual({ error: expect.any(String) });
    expect(logger.warn).toHaveBeenCalled();
  },
);

it('rejects truncated or trailing ABI data', () => {
  const message = example(AeroVoterMessageType.AllocateGauge);
  for (const body of [message.body.slice(0, -2), message.body + '00']) {
    expect(decodeAeroVoterMessage({ ...message, body })).toEqual({ error: expect.any(String) });
  }
});

it('rejects a return type sent from root to leaf', () => {
  const { body } = example(AeroVoterMessageType.Redeem);
  expect(decodeAeroVoterMessage({ ...outbound, body })).toEqual({ error: expect.any(String) });
});
