import { useQuery } from 'urql';

import type { MessageStub } from '../../types';
import { classifySwapMessages, readSwapEnvelope, type SwapMessage } from './swapMessages';
import { useSwapMessageApplications } from './useSwapMessageApplications';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: (compute: () => unknown) => compute(),
}));
jest.mock('urql', () => ({ useQuery: jest.fn() }));

// Captured MetaSwap 0xb10726fe… / 0x7dbf40a5… and HyperSwap 0x0ea8052e… / 0xb9020724….
const metaCommit: SwapMessage = {
  msgId: 'meta-commit',
  sender: '0xd61f078592ced81449a7405d837ff1b963b830ea',
  recipient: '0x0ca10c09cad7afe01619a4a9acdf6481938258c4',
  originDomainId: 1,
  destinationDomainId: 8453,
  origin: {
    hash: '0xe8f9306c4e2039ac57a67eada157c80d662419832ee394f2e21496562a560ba2',
  },
  body: '0x010000000000000000000000000fef9e88a7b76bcdbf451780c6774fe32965ee980000000000000000000000000000000000000000000000000000000000000000000000000000000000000000884c0a25646893b90e967e74fe22e24c950703b0ece60bc8a7e7186bd0427dab5f62acdf58892860e2e120cd46db7d7bd43fca7f',
};
const metaReveal: SwapMessage = {
  ...metaCommit,
  msgId: 'meta-reveal',
  body: '0x020000000000000000000000000000000000000000000000000000000000000000ece60bc8a7e7186bd0427dab5f62acdf58892860e2e120cd46db7d7bd43fca7f',
};
const hyperCommit: SwapMessage = {
  msgId: 'hyper-commit',
  sender: '0xf90a3d406c6f8321fe118861a357f4d7107760d7',
  recipient: '0xc00b94c115742f711a6f9ea90373c33e9b72a4a9',
  originDomainId: 42161,
  destinationDomainId: 1,
  origin: {
    hash: '0xd33fea10e8a942a9d1b09af3427bf67eaf9e2cfbe50f9c2bfc0f1d15fdcfb9b8',
  },
  body: '0x0100000000000000000000000052dd779c1b5eeb54d5f218efa72d52117ca041150000000000000000000000007a576bb5291567cfdbb4585b1911cf7c9891ea070000000000000000000000001cfd6a81e98de59e3eeb3ae35c3cb13fcb586e1e71b436f5508c5ebc687042fc49413280c6471646d7e2a6d777624edcf89b9cd0',
};
const hyperReveal: SwapMessage = {
  ...hyperCommit,
  msgId: 'hyper-reveal',
  body: '0x02000000000000000000000000000000000000000000000000000000000000000071b436f5508c5ebc687042fc49413280c6471646d7e2a6d777624edcf89b9cd0',
};

it('identifies each app and matches reveals regardless of row order', () => {
  const apps = classifySwapMessages([metaReveal, hyperReveal, metaCommit, hyperCommit]);
  expect([...apps.values()]).toEqual([
    { name: 'MetaSwap', stage: 'Reveal' },
    { name: 'HyperSwap', stage: 'Reveal' },
    { name: 'MetaSwap', stage: 'Commit' },
    { name: 'HyperSwap', stage: 'Commit' },
  ]);
  const padded = {
    ...metaCommit,
    sender: `0x${metaCommit.sender.slice(2).toUpperCase().padStart(64, '0')}`,
  };
  expect(classifySwapMessages([padded]).get(metaCommit.msgId)?.name).toBe('MetaSwap');
});

it('does not label unrelated, unknown-owner or unmatched ICA messages as swaps', () => {
  expect(classifySwapMessages([metaReveal]).size).toBe(0);
  const unknown = { ...metaCommit, body: `0x01${'11'.repeat(32)}${metaCommit.body.slice(68)}` };
  expect(classifySwapMessages([unknown, metaReveal]).size).toBe(0);
  for (const body of [metaCommit.body + '00', metaCommit.body.slice(0, -2), '0x01zz']) {
    expect(readSwapEnvelope({ ...metaCommit, body })).toBeNull();
  }
});

it('scopes reveal matching to the transaction, domains, routers and commitment', () => {
  for (const changes of [
    { origin: { hash: hyperCommit.origin.hash } },
    { destinationDomainId: 42161 },
    { sender: `0x${'11'.repeat(20)}` },
    { recipient: `0x${'22'.repeat(20)}` },
    { body: `${metaReveal.body.slice(0, -2)}ff` },
  ]) {
    expect(
      classifySwapMessages([metaCommit, { ...metaReveal, ...changes }]).has(metaReveal.msgId),
    ).toBe(false);
  }
});

it('leaves an ambiguous ownerless reveal unclassified', () => {
  const conflicting = {
    ...metaCommit,
    msgId: 'conflicting',
    body: `0x01${hyperCommit.body.slice(4, 68)}${metaCommit.body.slice(68)}`,
  };
  expect(classifySwapMessages([metaCommit, conflicting, metaReveal]).has(metaReveal.msgId)).toBe(
    false,
  );
});

it('only looks up missing commitments, batching and resolving off-page reveals', () => {
  const execute = jest.fn();
  jest
    .mocked(useQuery)
    .mockReturnValue([{ fetching: false, stale: false, hasNext: false }, execute]);
  useSwapMessageApplications([metaCommit, metaReveal] as MessageStub[], new Set());
  expect(jest.mocked(useQuery).mock.lastCall?.[0].pause).toBe(true);

  const bytea = (value: string) => `\\x${value.slice(2)}`;
  jest.mocked(useQuery).mockReturnValue([
    {
      fetching: false,
      stale: false,
      hasNext: false,
      data: {
        message_view: [
          {
            msg_id: `\\x${'11'.repeat(32)}`,
            message_body: bytea(metaCommit.body),
            sender: bytea(metaCommit.sender),
            recipient: bytea(metaCommit.recipient),
            origin_domain_id: metaCommit.originDomainId,
            destination_domain_id: metaCommit.destinationDomainId,
            origin_tx_hash: bytea(metaCommit.origin.hash),
          },
        ],
      },
    },
    execute,
  ]);
  jest.mocked(useQuery).mockClear();
  const bridge = { ...metaCommit, msgId: 'bridge', body: `0x${'ab'.repeat(64)}` };
  const apps = useSwapMessageApplications(
    [metaReveal, { ...metaReveal, msgId: 'duplicate' }, bridge] as MessageStub[],
    new Set([bridge.msgId]),
  );
  expect(useQuery).toHaveBeenCalledTimes(1);
  expect(jest.mocked(useQuery).mock.lastCall?.[0]).toMatchObject({
    pause: false,
    variables: { hashes: [bytea(metaCommit.origin.hash)] },
  });
  expect(apps.get(metaReveal.msgId)).toEqual({ name: 'MetaSwap', stage: 'Reveal' });
  expect(apps.get(bridge.msgId)).toEqual({ name: 'MetaSwap', stage: 'Bridge' });
});

it('attributes only recognized bridge transfers on an unambiguous swap transaction and route', () => {
  for (const commit of [metaCommit, hyperCommit]) {
    const bridge = { ...commit, msgId: 'bridge', body: `0x${'ab'.repeat(64)}` };
    const ids = new Set([bridge.msgId]);
    expect(classifySwapMessages([bridge, commit], ids).get(bridge.msgId)).toEqual({
      name: commit === metaCommit ? 'MetaSwap' : 'HyperSwap',
      stage: 'Bridge',
    });
    expect(classifySwapMessages([bridge, commit]).has(bridge.msgId)).toBe(false);
    expect(
      classifySwapMessages(
        [{ ...bridge, origin: { hash: `0x${'ff'.repeat(32)}` } }, commit],
        ids,
      ).has(bridge.msgId),
    ).toBe(false);
    expect(
      classifySwapMessages([{ ...bridge, destinationDomainId: 137 }, commit], ids).has(
        bridge.msgId,
      ),
    ).toBe(false);
    const unknown = {
      ...commit,
      msgId: 'unknown',
      body: `0x01${'11'.repeat(32)}${commit.body.slice(68)}`,
    };
    expect(classifySwapMessages([bridge, commit, unknown], ids).has(bridge.msgId)).toBe(false);
  }
});
