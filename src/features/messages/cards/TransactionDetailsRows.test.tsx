import { renderToStaticMarkup } from 'react-dom/server';

import { TransactionDetailsRows } from './TransactionDetailsRows';

jest.mock('../../../utils/addresses', () => ({ formatTxHash: (hash: string) => hash }));
jest.mock('../../../utils/url', () => ({
  getBlockExplorerAddressUrl: () => null,
  getBlockExplorerTxUrl: () => null,
}));
jest.mock('../../chains/utils', () => ({ getChainDisplayName: () => 'Ethereum' }));
jest.mock('./KeyValueRow', () => ({
  KeyValueRow: ({
    label,
    display,
    subDisplay,
  }: {
    label: string;
    display: string;
    subDisplay?: string;
  }) => (
    <div>
      {label} {display} {subDisplay}
    </div>
  ),
}));

const resolver = { tryGetChainMetadata: () => null, tryGetChainName: () => 'ethereum' };

function render(current?: number | null, required = 15) {
  return renderToStaticMarkup(
    <TransactionDetailsRows
      chainName="ethereum"
      domainId={1}
      resolver={resolver}
      blur={false}
      transaction={{ hash: '0x01', timestamp: 0, blockNumber: 100 }}
      confirmationProgress={current === undefined ? null : { current, required }}
    />,
  );
}

it('shows origin confirmations immediately below the block', () => {
  const html = render(5);
  expect(html).toContain('Confirmations: 5 / 15 Confirming');
  expect(html.indexOf('Block:')).toBeLessThan(html.indexOf('Confirmations:'));
  expect(render(15)).toContain('Confirmations: 15 / 15 Confirmed');
});

it('keeps unknown heads explicit and omits unnecessary confirmation rows', () => {
  expect(render(null)).toContain('Waiting for block data');
  expect(render()).not.toContain('Confirmations:');
  expect(render(0, 0)).not.toContain('Confirmations:');
});
