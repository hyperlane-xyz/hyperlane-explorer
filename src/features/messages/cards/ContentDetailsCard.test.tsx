/** @jest-environment jsdom */
import { utils } from 'ethers';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { isAeroVoterMessage } from '../../../consts/aeroVoterRoutes';
import { MessageStatus, type MessageStub } from '../../../types';
import { getMessageEncoding } from '../messageEncoding';
import { ContentDetailsCard } from './ContentDetailsCard';

jest.mock('@hyperlane-xyz/utils', () => ({ strip0x: (value: string) => value.replace(/^0x/, '') }));
jest.mock('../messageEncoding', () => ({ getMessageEncoding: jest.fn() }));
jest.mock('../../../utils/addresses', () => ({ formatAddress: (address: string) => address }));

jest.mock('@hyperlane-xyz/widgets', () => ({
  BoxArrowIcon: () => null,
  ChevronIcon: () => null,
  CopyButton: ({ copyValue, ...props }: { copyValue: string }) => (
    <button {...props} data-copy={copyValue} />
  ),
}));
jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({
    tryGetChainName: () => undefined,
    tryGetChainMetadata: () => undefined,
  }),
}));
jest.mock('../../../utils/url', () => ({
  getBlockExplorerAddressUrl: (_metadata: unknown, _domain: number, address: string) =>
    `https://example.com/address/${address}`,
}));
jest.mock('../eco', () => ({ isEcoMessage: () => false }));
jest.mock('../../../consts/aeroVoterRoutes', () => ({ isAeroVoterMessage: jest.fn() }));

test.each([false, true])(
  'keeps payload at the card root and fields available in either representation (Aero: %s)',
  async (aero) => {
    jest.mocked(isAeroVoterMessage).mockReturnValue(aero);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const sender = `0x${'11'.repeat(20)}`;
    const recipient = `0x${'22'.repeat(20)}`;
    const wireSender = utils.hexZeroPad(sender, 32);
    const wireRecipient = utils.hexZeroPad(recipient, 32);
    const raw = utils.solidityPack(
      ['uint8', 'uint32', 'uint32', 'bytes32', 'uint32', 'bytes32', 'bytes'],
      [3, 42, 1, wireSender, 2, wireRecipient, '0x1234'],
    );
    jest.mocked(getMessageEncoding).mockReturnValue({
      raw,
      version: 3,
      nonce: 42,
      origin: 1,
      sender: wireSender,
      destination: 2,
      recipient: wireRecipient,
      body: '0x1234',
    });
    const message: MessageStub = {
      id: '1',
      msgId: utils.keccak256(raw),
      nonce: 42,
      sender,
      recipient,
      originChainId: 1,
      originDomainId: 1,
      destinationChainId: 2,
      destinationDomainId: 2,
      body: '0x1234',
      status: MessageStatus.Pending,
      origin: { hash: '', timestamp: 0 },
    };
    try {
      await act(async () => root.render(<ContentDetailsCard message={message} blur={false} />));
      const envelope = container.querySelector('details')!;
      const payload = container.querySelector('section[aria-label="Message payload"]')!;
      expect(payload).toBe(container.firstElementChild);
      expect(container.querySelectorAll('section')).toHaveLength(1);
      expect(payload.querySelector('h2')?.textContent).toBe('Message payload');
      if (aero) expect(payload.textContent).toContain('Aero V3 message');
      expect(envelope.open).toBe(false);
      expect(envelope.contains(payload)).toBe(false);
      expect(payload.textContent).toContain('0x1234');
      await act(async () => {
        envelope.open = true;
      });
      const fields = [...envelope.querySelectorAll('dt')].map((field) => field.textContent);
      expect(fields.slice(0, 3)).toEqual(['Version', 'Nonce', 'Message ID']);
      expect(fields).toEqual(
        expect.arrayContaining([
          'Version',
          'Nonce',
          'Message ID',
          'Sender · bytes32',
          'Recipient · bytes32',
        ]),
      );
      expect(envelope.textContent).toContain('Domain 1');
      expect(envelope.textContent).toContain('Domain 2');
      expect(envelope.querySelector('a')?.getAttribute('href')).toBe(
        `https://example.com/address/${sender}`,
      );
      expect(
        envelope.querySelector('[aria-label="Copy sender address"]')?.getAttribute('data-copy'),
      ).toBe(`0x${'00'.repeat(12)}${sender.slice(2)}`);
      const version = [...envelope.querySelectorAll('dt')].find(
        (field) => field.textContent === 'Version',
      )!;
      expect(version.nextElementSibling?.textContent).toBe('3');
      await act(async () =>
        [...envelope.querySelectorAll('button')]
          .find((button) => button.textContent === 'Raw')!
          .click(),
      );
      expect(envelope.querySelector('[aria-label="Raw message bytes"]')?.textContent).toBe(raw);
      expect(payload.textContent).toContain('0x1234');
      expect(
        envelope.querySelector('[aria-label="Copy raw message"]')?.getAttribute('data-copy'),
      ).toBe(raw);
    } finally {
      await act(async () => root.unmount());
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    }
  },
);
