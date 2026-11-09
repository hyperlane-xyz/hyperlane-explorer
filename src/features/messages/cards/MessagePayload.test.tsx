/** @jest-environment jsdom */
import { TextDecoder } from 'node:util';

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { MessageStub } from '../../../types';
import { MessagePayload } from './MessagePayload';

const mockCopy = jest.fn();
jest.mock('@hyperlane-xyz/utils', () => ({ strip0x: (value: string) => value.replace(/^0x/, '') }));
jest.mock('@hyperlane-xyz/widgets', () => ({
  CopyButton: ({ copyValue, ...props }: { copyValue: string }) => (
    <button {...props} onClick={() => mockCopy(copyValue)} />
  ),
}));

let container: HTMLDivElement;
let root: Root;
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousDecoder = globalThis.TextDecoder;
beforeAll(() =>
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true }),
);
afterAll(() =>
  Object.defineProperty(globalThis, 'TextDecoder', { value: previousDecoder, configurable: true }),
);
beforeEach(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  mockCopy.mockClear();
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
const render = async (body: string, compact = false, msgId = 'message', details?: ReactNode) =>
  act(async () =>
    root.render(
      <MessagePayload
        message={{ body, msgId } as MessageStub}
        compact={compact}
        details={details}
      />,
    ),
  );

test('switches original hex to a literal UTF-8 preview and always copies the original payload', async () => {
  const text = 'Hello 👋\n<em>literal text</em>';
  const body = `0x${Buffer.from(text).toString('hex')}`;
  await render(body);
  expect(container.textContent).toContain(`${Buffer.byteLength(text)} bytes`);
  expect(container.textContent).not.toContain('Application data · decoding needs its format.');
  expect(button('Hex').getAttribute('aria-pressed')).toBe('true');
  expect(button('Text').getAttribute('aria-pressed')).toBe('false');
  expect(container.querySelector('code')?.textContent).toBe(body);
  await click('Text');
  expect(button('Text').getAttribute('aria-pressed')).toBe('true');
  expect(button('Hex').getAttribute('aria-pressed')).toBe('false');
  expect(container.querySelector('code')?.textContent).toBe(text);
  expect(container.querySelector('em')).toBeNull();
  expect(container.textContent).toContain('UTF-8 preview; not ABI decoded.');
  await click('Copy original payload');
  expect(mockCopy).toHaveBeenCalledWith(body);
});

test('bounds long previews, expands on request, and resets view when changing messages', async () => {
  const body = `0x${'61'.repeat(1000)}`;
  await render(body, true);
  expect(container.querySelector('code')!.textContent!.length).toBeLessThan(300);
  expect(button('Show more').getAttribute('aria-expanded')).toBe('false');
  await click('Show more');
  expect(container.querySelector('code')?.textContent).toBe(body);
  expect(button('Show less').getAttribute('aria-expanded')).toBe('true');
  await click('Show less');
  expect(container.querySelector('code')!.textContent!.length).toBeLessThan(300);
  await click('Text');
  await click('Show more');
  expect(container.querySelector('code')?.textContent).toBe('a'.repeat(1000));
  await click('Copy original payload');
  expect(mockCopy).toHaveBeenCalledWith(body);
  await render(body, true, 'other-message');
  expect(button('Hex').getAttribute('aria-pressed')).toBe('true');
  expect(button('Show more').getAttribute('aria-expanded')).toBe('false');
});

test.each(['', '0x'])(
  'shows an empty payload without loading or decoding artifacts: %s',
  async (body) => {
    await render(body);
    expect(container.textContent).toContain('0 bytes');
    expect(container.textContent).toContain('No payload data.');
    expect(container.querySelector('code')).toBeNull();
    await click('Text');
    expect(container.textContent).toContain('No payload data.');
    expect(container.textContent).not.toContain('No UTF-8 text preview available');
  },
);

test('keeps binary or malformed bytes distinct from valid text', async () => {
  await render('0xfffe');
  await click('Text');
  expect(container.textContent).toContain('2 bytes');
  expect(container.textContent).toContain('No UTF-8 text preview available');
  expect(container.textContent).not.toContain('�');
  for (const body of ['0xabc', '0x61zz']) {
    await render(body);
    expect(container.textContent).toContain('Byte count unavailable');
    expect(container.querySelector('code')).toBeNull();
    await click('Hex');
    expect(container.querySelector('code')?.textContent).toBe(body);
    expect(container.textContent).toContain('Payload is not valid hexadecimal data.');
    await click('Text');
    expect(container.textContent).toContain('No UTF-8 text preview available');
  }
});

test('makes control bytes visible while preserving text whitespace', async () => {
  await render(`0x${Buffer.from('a\0b\tc\n').toString('hex')}`);
  await click('Text');
  expect(container.querySelector('code')?.textContent).toBe('a\\x00b\tc\n');
  expect(container.textContent).toContain('Control bytes are escaped.');
});

test('defaults to Details when decoding arrives, keeps live content current, and copies original bytes', async () => {
  const body = '0x6869';
  await render(body);
  expect(button('Hex').getAttribute('aria-pressed')).toBe('true');
  expect(button('Details')).toBeUndefined();
  await render(body, false, 'message', <p>Transfer: 2 USDC</p>);
  expect(button('Details').getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).toContain('Transfer: 2 USDC');
  expect(container.textContent).toContain('2 bytes');
  expect(container.querySelector('code')).toBeNull();
  expect(container.textContent).not.toContain('Application data');
  expect(container.textContent).not.toContain('UTF-8 preview');
  await render(body, false, 'message', <p>Transfer: 3 USDC</p>);
  expect(container.textContent).toContain('Transfer: 3 USDC');
  expect(container.textContent).not.toContain('Transfer: 2 USDC');
  await click('Copy original payload');
  expect(mockCopy).toHaveBeenCalledWith(body);
});

test.each(['Hex', 'Text'])(
  'keeps explicit %s selection through async details detection and live updates',
  async (view) => {
    const body = '0x6869';
    await render(body);
    await click(view);
    await render(body, false, 'message', <p>Transfer: 2 USDC</p>);
    expect(button(view).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('code')?.textContent).toBe(view === 'Hex' ? body : 'hi');
    await render(body, false, 'message', <p>Transfer: 3 USDC</p>);
    expect(button(view).getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain('Transfer:');
    await render(body, false, 'other-message', <p>Transfer: 3 USDC</p>);
    expect(button('Details').getAttribute('aria-pressed')).toBe('true');
  },
);

test('falls back to Hex when selected details disappear, without retaining decoded content', async () => {
  const body = '0x6869';
  await render(body, false, 'message', <p>Transfer: 2 USDC</p>);
  await click('Text');
  await click('Details');
  await render(body);
  expect(button('Details')).toBeUndefined();
  expect(button('Hex').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('code')?.textContent).toBe(body);
  expect(container.textContent).not.toContain('Transfer:');
  await click('Text');
  await render(body, false, 'message', <p>Transfer: 2 USDC</p>);
  expect(button('Text').getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('code')?.textContent).toBe('hi');
});
