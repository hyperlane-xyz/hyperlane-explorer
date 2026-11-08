/** @jest-environment jsdom */
import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { formatMessage, hexToRadixCustomPrefix, ProtocolType } from '@hyperlane-xyz/utils';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { MAILBOX_VERSION } from '../../../consts/mailbox';
import { MessageStatus, type MessageStub, type WarpRouteDetails } from '../../../types';
import { ContentDetailsCard } from './ContentDetailsCard';

const mockCopy = jest.fn();
jest.mock('../../../utils/logger', () => ({ logger: { warn: jest.fn() } }));
jest.mock('@hyperlane-xyz/utils', () => {
  // The real protocol address helpers need encoders before loading in jsdom.
  const { TextEncoder, TextDecoder } = jest.requireActual('node:util');
  Object.assign(globalThis, {
    TextEncoder,
    TextDecoder,
    fetch: jest.fn(() => Promise.reject(new Error('Unexpected network request'))),
  });
  return {
    ...jest.requireActual('@hyperlane-xyz/utils'),
    formatMessage: jest.fn(() => '0xencoded'),
  };
});
jest.mock('@hyperlane-xyz/widgets', () => ({
  BoxArrowIcon: () => null,
  CopyButton: ({ copyValue, ...props }: { copyValue: string }) => (
    <button {...props} data-copy={copyValue} onClick={() => mockCopy(copyValue)}>
      Copy
    </button>
  ),
}));
jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainName: (id: number) => mockMetadata.find((chain) => chain.domainId === id)?.name,
    tryGetChainMetadata: (id: number | string) =>
      mockMetadata.find((chain) => chain.domainId === id || chain.name === id),
  }),
}));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function WarpDetails({
      message,
      warpRouteDetails,
    }: {
      message: MessageStub;
      warpRouteDetails: WarpRouteDetails;
    }) {
      return <p data-warp-message={message.msgId}>Decoded transfer: {warpRouteDetails.amount}</p>;
    },
}));

const message: MessageStub = {
  id: '1',
  msgId: `0x${'77'.repeat(32)}`,
  nonce: 0,
  status: MessageStatus.Pending,
  originChainId: 1,
  originDomainId: 1,
  destinationChainId: 2,
  destinationDomainId: 2,
  sender: `0x0000${'01'.repeat(30)}`,
  recipient: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  body: '0x1234',
  origin: { hash: `0x${'55'.repeat(32)}`, timestamp: 1000 },
};
const mockMetadata: ChainMetadata[] = [
  {
    name: 'radix',
    chainId: 1,
    domainId: 1,
    protocol: ProtocolType.Radix,
    bech32Prefix: 'account_rdx',
    rpcUrls: [{ http: 'https://rpc.invalid' }],
    blockExplorers: [{ name: 'source', url: 'https://source.test', family: 'radixdashboard' }],
  },
  {
    name: 'solana',
    chainId: 2,
    domainId: 2,
    protocol: ProtocolType.Sealevel,
    rpcUrls: [{ http: 'https://rpc.invalid' }],
    blockExplorers: [{ name: 'destination', url: 'https://destination.test', family: 'etherscan' }],
  },
];

let container: HTMLDivElement;
let root: Root;
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
beforeEach(() => {
  jest.mocked(formatMessage).mockReset().mockReturnValue('0xencoded');
  mockCopy.mockClear();
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
const button = (label: string) =>
  [...container.querySelectorAll('button')].find(
    (element) => element.textContent === label || element.getAttribute('aria-label') === label,
  )!;
const click = async (label: string) => act(async () => button(label).click());
const render = (value = message, children?: ReactNode) =>
  act(async () =>
    root.render(
      <ContentDetailsCard message={value} blur={false}>
        {children}
      </ContentDetailsCard>,
    ),
  );

test('keeps full identity and zero nonce, links native endpoints, and encodes original envelope fields', () => {
  const html = renderToStaticMarkup(<ContentDetailsCard message={message} blur={false} />);
  const nativeSender = hexToRadixCustomPrefix(message.sender, 'component', 'account_rdx', 30);
  expect(html).toContain(`>${message.msgId}</code>`);
  expect(html).toContain(`aria-label="Copy message ID"`);
  expect(html).toContain(`data-copy="${message.msgId}"`);
  expect(html).toContain('>0</span>');
  expect(html).toMatch(/aria-label="Copy nonce"[^>]*data-copy="0"/);
  expect(html).toContain(`href="https://source.test/component/${nativeSender}"`);
  expect(html).toContain(`data-copy="${nativeSender}"`);
  expect(html).toContain(`href="https://destination.test/address/${message.recipient}"`);
  expect(html).toContain(`data-copy="${message.recipient}"`);
  expect(html).not.toContain(message.recipient.toLowerCase());
  expect(formatMessage).toHaveBeenCalledWith(
    MAILBOX_VERSION,
    0,
    message.originDomainId,
    message.sender,
    message.destinationDomainId,
    message.recipient,
    message.body,
  );
});

test('shows supplied decoded Warp content by default while preserving original payload copy', () => {
  const route = { amount: '4996.61864' } as WarpRouteDetails;
  const html = renderToStaticMarkup(
    <ContentDetailsCard message={message} blur={false} warpRouteDetails={route} />,
  );
  expect(html).toMatch(/aria-pressed="true"[^>]*>Warp<\/button>/);
  expect(html).toContain(`data-warp-message="${message.msgId}"`);
  expect(html).toContain('Decoded transfer: 4996.61864');
  expect(html).toContain('2 bytes');
  expect(html).toMatch(/aria-label="Copy original payload"[^>]*data-copy="0x1234"/);
  expect(html).not.toContain('Application data · decoding needs its format.');
});

test('switches representation, copies the full envelope, and resets Details for another message', async () => {
  const raw = `0x${'ab'.repeat(600)}`;
  jest.mocked(formatMessage).mockReturnValue(raw);
  await render(message, <p>Decoded application instructions</p>);
  const payload = container.querySelector('[aria-label="Message payload"]')!;
  expect(button('Details').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[aria-label="Raw message bytes"]')).toBeNull();
  expect(payload.closest('[hidden]')).toBeNull();
  expect(container.textContent).toContain('Decoded application instructions');
  expect(container.querySelector('header')?.contains(button('Copy raw message'))).toBe(true);
  await click('Copy raw message');
  expect(mockCopy).toHaveBeenLastCalledWith(raw);

  await click('Raw');
  expect(button('Raw').getAttribute('aria-pressed')).toBe('true');
  expect(payload.closest('[hidden]')).not.toBeNull();
  const encoded = container.querySelector('[aria-label="Raw message bytes"]')!;
  expect(encoded.closest('[hidden]')).toBeNull();
  expect(encoded.textContent).toBe(raw);
  await click('Copy raw message');
  expect(mockCopy).toHaveBeenLastCalledWith(raw);
  await click('Details');
  expect(container.querySelector('[aria-label="Message payload"]')).toBe(payload);
  expect(payload.closest('[hidden]')).toBeNull();
  await click('Raw');
  await render({ ...message, msgId: 'another-message' });
  expect(button('Details').getAttribute('aria-pressed')).toBe('true');
  await render(message);
  expect(button('Details').getAttribute('aria-pressed')).toBe('true');
});

test('shows encoding failure without offering an empty raw-message copy', async () => {
  jest.mocked(formatMessage).mockImplementation(() => {
    throw new Error('Invalid envelope');
  });
  await render();
  expect(button('Copy raw message').disabled).toBe(true);
  await click('Raw');
  expect(container.querySelector('[aria-label="Raw message bytes"]')).toBeNull();
  expect(container.textContent).toContain('Raw message bytes unavailable.');
  await click('Copy raw message');
  expect(mockCopy).not.toHaveBeenCalled();
});
