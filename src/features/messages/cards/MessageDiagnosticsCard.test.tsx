import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { renderToStaticMarkup } from 'react-dom/server';

import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import type { DiagnosticState } from '../diagnostics/types';
import { MessageDiagnosticsCard } from './MessageDiagnosticsCard';

jest.mock('@hyperlane-xyz/widgets', () => ({
  SpinnerIcon: () => <span data-testid="spinner" />,
  BoxArrowIcon: () => null,
  CopyButton: ({ copyValue }: { copyValue: string }) => <button data-copy={copyValue}>Copy</button>,
}));
jest.mock('../diagnostics/MessageDiagnosticsContext', () => ({
  useMessageDiagnosticsContext: jest.fn(),
}));
jest.mock('../../../metadataStore', () => ({
  useChainMetadata: () => mockMetadata,
  useChainMetadataResolver: () => ({ tryGetChainMetadata: () => mockMetadata }),
}));

const useDiagnostics = jest.mocked(useMessageDiagnosticsContext);
const address = `0x${'11'.repeat(20)}`;
let mockMetadata: ChainMetadata;

function report(state?: DiagnosticState) {
  const observation = state
    ? {
        relayer: address,
        observedAt: '2026-11-07T12:00:00Z',
        activityId: '1',
        state,
      }
    : undefined;
  return {
    diagnostics: null,
    activities: [],
    history: {
      activityPage: null,
      loadedActivities: [],
      page: 0,
      fetching: false,
      error: undefined,
      next: jest.fn(),
      previous: jest.fn(),
      latest: jest.fn(),
    },
    observation,
    relayers: observation ? [observation] : [],
    connectionState: 'live' as const,
    fetching: false,
    selectedRelayer: '',
    setSelectedRelayer: jest.fn(),
  };
}

function render(delivered = false) {
  return renderToStaticMarkup(
    <MessageDiagnosticsCard
      originDomainId={57073}
      destinationChainName={mockMetadata.name}
      delivered={delivered}
    />,
  );
}

beforeEach(() => {
  mockMetadata = {
    name: 'ethereum',
    chainId: 1,
    domainId: 1,
    protocol: ProtocolType.Ethereum,
    nativeToken: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [{ http: 'https://rpc.invalid' }],
    blockExplorers: [
      {
        name: 'Explorer',
        url: 'https://explorer.test',
        apiUrl: 'https://explorer.test',
        family: 'etherscan',
      },
    ],
  };
  useDiagnostics.mockReturnValue(report());
});

it('keeps unused failed alternatives neutral and shows the satisfied threshold', () => {
  useDiagnostics.mockReturnValue(
    report({
      phase: 'ready_to_submit',
      tree_root: 'root',
      modules: [
        {
          node_id: 'root',
          ism: address,
          module_type: 'Aggregation',
          threshold: 1,
          verified: 1,
          selected_children: ['selected'],
          children: [
            { node_id: 'selected', ism: address },
            { node_id: 'unused', ism: address },
          ],
        },
        { node_id: 'selected', ism: address, children: [], verification: 'succeeded' },
        {
          node_id: 'unused',
          ism: address,
          children: [],
          verification: 'failed',
          metadata_error: 'Simulation failed',
        },
      ],
    }),
  );
  const html = render();
  expect(html).toContain('data-node-id="unused" data-state="unused"');
  expect(html).toContain('Threshold met');
  expect(html).toContain('1/2 checks passed');
  expect(html).toContain('title="1 of 2 checks required"');
  expect(html).not.toContain('Attempt failed');
  expect(html).not.toContain('text-red-700');
  expect(html).toContain('text-green-700');
  expect(html.split('data-node-id="unused"')[1]).not.toContain('text-green-700');
});

it('distinguishes ready CCIP proof data from actual destination acceptance', () => {
  useDiagnostics.mockReturnValue(
    report({
      phase: 'ready_to_submit',
      tree_root: 'root',
      modules: [
        {
          node_id: 'root',
          ism: address,
          module_type: 'CcipRead',
          children: [],
          metadata_status: 'ready',
          offchain_read: { state: 'succeeded', http_status: 200 },
        },
      ],
    }),
  );
  const html = render();
  expect(html).toMatch(/^<section/);
  expect(html).not.toContain('View validation path');
  expect(html).toMatch(/<h2[^>]*>Security validation<\/h2>/);
  expect(html).toContain('Validation ready');
  expect(html).toContain('data-node-id="root" data-state="ready"');
  expect(html).toContain('Gateway responded successfully · HTTP 200');
  expect(html).toContain('Destination acceptance is tracked separately.');
  expect(html).not.toContain('Relayer verification check passed.');
  expect(html).not.toContain('Accepted on destination');
  expect(html).toContain('text-green-700');
  expect(render(true)).toContain('Accepted on destination');
});

it('shows loading first, then neutral waiting when no reporter has observed the message', () => {
  useDiagnostics.mockReturnValue({ ...report(), fetching: true });
  expect(render()).toContain('Loading validation details…');
  expect(render()).toContain('data-testid="spinner"');
  useDiagnostics.mockReturnValue(report());
  const html = render();
  expect(html).toContain('Waiting for a relayer observation.');
  expect(html).not.toContain('Attempt failed');
  expect(html).not.toContain('data-testid="spinner"');

  useDiagnostics.mockReturnValue(
    report({ phase: 'dropped', modules: [{ node_id: 'root', ism: address, children: [] }] }),
  );
  const stopped = render();
  expect(stopped).toContain('Last reported checks');
  expect(stopped).not.toContain('Checks in progress');
  expect(stopped).not.toContain('data-testid="spinner"');
  expect(stopped).not.toContain('>Checking<');
});

it('keeps incomplete aggregation counts honest and stops recursive branch cycles', () => {
  useDiagnostics.mockReturnValue(
    report({
      phase: 'preparing',
      tree_root: 'root',
      modules: [
        {
          node_id: 'root',
          ism: address,
          module_type: 'Aggregation',
          threshold: 2,
          verified: 1,
          children: [],
        },
      ],
    }),
  );
  expect(render()).toContain('2 checks required');
  expect(render().replace(/<[^>]*>/g, '')).toContain('1/2 required checks passed');
  expect(render()).not.toContain('of 0');
  useDiagnostics.mockReturnValue(
    report({
      phase: 'preparing',
      tree_root: 'root',
      modules: [
        {
          node_id: 'root',
          ism: address,
          children: [
            { node_id: 'root', ism: address },
            { node_id: 'missing', ism: address },
          ],
        },
      ],
    }),
  );
  const html = render();
  expect(html).toContain('Further branch details unavailable');
  expect(html).toContain('Waiting for module details');
});

it.each(['MessageIdMultisig', 'MerkleRootMultisig'])(
  'shows the %s threshold once in its caption, distinct from signatures collected',
  (moduleType) => {
    const validators = Array.from({ length: 9 }, (_, i) => `0x${String(i + 1).repeat(40)}`);
    const node = {
      node_id: 'root',
      ism: address,
      module_type: moduleType,
      children: [],
      validators,
      threshold: 6,
      signatures: {
        collected: 6,
        index: 7,
        root: `0x${'44'.repeat(32)}`,
        unavailable: [],
      },
    };
    useDiagnostics.mockReturnValue(report({ tree_root: 'root', modules: [node] }));
    const html = render();
    expect(html.match(/6 of 9 signatures required/g)).toHaveLength(1);
    expect(html).toMatch(/<summary[^>]*>[\s\S]*6 of 9 signatures required[\s\S]*?<\/summary>/);
    expect(html.replace(/<[^>]*>/g, '')).toContain('6 signatures collected');
    expect(html.match(/data-validator-status="unknown"/g)).toHaveLength(9);
    for (const validator of validators) expect(html).toContain(`data-copy="${validator}"`);
    expect(html).not.toContain('✓ Signature observed');

    useDiagnostics.mockReturnValue(
      report({ tree_root: 'root', modules: [{ ...node, verification: 'succeeded' }] }),
    );
    const passed = render();
    expect(passed).toContain('6/9 signatures collected');
    expect(passed).toContain('title="6 of 9 signatures required"');
    expect(passed.replace(/<[^>]*>/g, '')).not.toContain('signatures required');
    expect(passed).not.toContain('✓ Signature observed');

    useDiagnostics.mockReturnValue(
      report({
        tree_root: 'root',
        modules: [
          {
            ...node,
            verification: 'succeeded',
            signatures: { ...node.signatures, collected: undefined },
          },
        ],
      }),
    );
    expect(render()).toContain('6 of 9 signatures required');
    expect(render()).not.toContain('signatures collected');

    useDiagnostics.mockReturnValue(
      report({ tree_root: 'root', modules: [{ ...node, validators: undefined }] }),
    );
    expect(render()).toContain('6 signatures required');
    expect(render().replace(/<[^>]*>/g, '')).toContain('6 signatures collected');
    expect(render()).not.toContain('of 0');
  },
);

it('labels routing with message origin context, including unused alternatives', () => {
  useDiagnostics.mockReturnValue(
    report({
      phase: 'ready_to_submit',
      tree_root: 'root',
      modules: [
        {
          node_id: 'root',
          ism: address,
          module_type: 'Aggregation',
          children: [{ node_id: 'route', ism: address }],
          selected_children: [],
        },
        { node_id: 'route', ism: address, module_type: 'Routing', children: [] },
      ],
    }),
  );
  const html = render();
  expect(html).toContain('Origin domain 57073');
  expect(html).toContain('data-node-id="route" data-state="unused"');
  expect(html).not.toContain('Selected route');
});
