import { renderToStaticMarkup } from 'react-dom/server';

import { diagnosticStateSchema, type DiagnosticState } from '../diagnostics/types';
import { MessageDiagnosticsCard } from './MessageDiagnosticsCard';

let mockState: DiagnosticState;
jest.mock('../diagnostics/MessageDiagnosticsContext', () => ({
  useMessageDiagnosticsContext: () => ({
    observation: { relayer: 'relayer', state: mockState },
    connectionState: 'historical',
  }),
}));
jest.mock('../../../metadataStore', () => ({ useChainMetadata: () => undefined }));
jest.mock('../queries/encoding', () => ({ postgresByteaToAddress: (value: string) => value }));
jest.mock('./ismRender/AddressInline', () => ({
  AddressInline: ({ address }: { address: string }) => <span>{address}</span>,
}));
jest.mock('@hyperlane-xyz/widgets', () => ({
  BoxArrowIcon: () => null,
  SpinnerIcon: () => null,
  CopyButton: ({ copyValue }: { copyValue: string }) => (
    <button aria-label="Copy value" data-copy={copyValue} />
  ),
}));

function renderModule(fields: Record<string, unknown>) {
  mockState = diagnosticStateSchema.parse({
    phase: 'ready_to_submit',
    modules: [{ node_id: 'leaf', ism: 'program', metadata_status: 'ready', ...fields }],
  });
  return renderToStaticMarkup(
    <MessageDiagnosticsCard originDomainId={1} destinationChainName="ethereum" delivered={false} />,
  );
}

test('shows recorded proof evidence, including zero indices and full copyable roots', () => {
  const checkpointRoot = `0x${'ab'.repeat(32)}`;
  const html = renderModule({
    module_type: 'MerkleRootMultisig',
    verification: 'succeeded',
    signatures: { index: 0, root: checkpointRoot, signers: [] },
    merkle_leaf: { index: 0, highest_known: 0 },
  });
  expect(html).toContain('Checkpoint index</dt><dd class="min-w-0 font-mono">0</dd>');
  expect(html).toContain(`data-copy="${checkpointRoot}"`);
  expect(html).toContain('Message leaf index</dt><dd class="min-w-0 font-mono">0</dd>');
  expect(html).toContain('Latest known leaf</dt><dd class="min-w-0 font-mono">0</dd>');
  expect(html).toContain('Verification dry run');
  expect(html).toContain('Succeeded');
  expect(html).not.toContain('Destination acceptance is tracked separately');
});

test('does not invent checkpoint or verification evidence from ready metadata', () => {
  const html = renderModule({ module_type: 'Null' });
  expect(html).toContain('Proof ready');
  expect(html).not.toContain('Proof data is ready');
  expect(html).not.toContain('Checkpoint index');
  expect(html).not.toContain('Verification dry run');
  expect(html).not.toContain('Message leaf index');
});

test('shows validator checkpoint observations and availability without implying signatures', () => {
  const validator = `0x${'aa'.repeat(20)}`;
  const html = renderModule({
    module_type: 'MessageIdMultisig',
    signatures: {
      signers: [],
      latest_indices: [{ validator, index: 42 }],
      unavailable: [{ validator, reason: 'index_mismatch' }],
    },
  });
  expect(html).toContain('Latest checkpoint');
  expect(html).toMatch(/>42<\/span>/);
  expect(html).toContain('observed by this relayer during proof collection');
  expect(html).toContain('Fetched checkpoint has a different index');
  expect(html).not.toContain('✓ Observed');
});

test('shows CCIP response evidence without inferring successful verification', () => {
  const html = renderModule({
    module_type: 'CcipRead',
    offchain_read: { state: 'succeeded', http_status: 200, endpoint: 0 },
  });
  expect(html).toContain('Proof data received and decoded');
  expect(html).toContain('HTTP status</dt><dd class="min-w-0 font-mono">200</dd>');
  expect(html).toContain('Endpoint 1');
  expect(html).not.toContain('Verification dry run');
});

test('keeps pending CCIP responses distinct from received proof data', () => {
  const html = renderModule({
    module_type: 'CcipRead',
    metadata_status: 'blocked',
    offchain_read: { state: 'pending', http_status: 404, endpoint: null },
  });
  expect(html).toContain('Waiting for offchain attestation');
  expect(html).toContain('HTTP status</dt><dd class="min-w-0 font-mono">404</dd>');
  expect(html).not.toContain('Proof data received and decoded');
  expect(html).not.toContain('Endpoint ');
});
