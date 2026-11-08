/** @jest-environment jsdom */
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { MessageRelayActivityPanel } from './MessageRelayActivityPanel';

jest.mock('@hyperlane-xyz/utils', () => ({ shortenAddress: (value: string) => value }));
jest.mock('@hyperlane-xyz/widgets', () => ({ CopyButton: () => null }));
jest.mock('../diagnostics/MessageDiagnosticsContext');

const useDiagnostics = jest.mocked(useMessageDiagnosticsContext);
const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const address = `0x${'11'.repeat(20)}`;
const observation = {
  relayer: address,
  activityId: '1',
  observedAt: '2026-11-07T11:09:25Z',
  state: { phase: 'preparing', modules: [], relayer_first_seen_at_millis: 2000 },
};
const message = {
  msgId: 'message',
  status: MessageStatus.Pending,
  origin: { timestamp: 1000 },
} as MessageStub;
let context: ReturnType<typeof useMessageDiagnosticsContext>;
let rootElement: HTMLDivElement;
let root: Root;

beforeEach(() => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  rootElement = document.createElement('div');
  root = createRoot(rootElement);
  context = {
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
    relayers: [observation],
    selectedRelayer: '',
    setSelectedRelayer: jest.fn(),
    connectionState: 'live',
    fetching: false,
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
const render = async (props: Partial<ComponentProps<typeof MessageRelayActivityPanel>> = {}) => {
  useDiagnostics.mockReturnValue(context);
  await act(async () => {
    root.render(<MessageRelayActivityPanel message={message} confirmed={false} {...props} />);
  });
};
it('shows shared activity and retains manual/automatic reporter selection', async () => {
  await render();
  expect(rootElement.firstElementChild?.tagName).toBe('SECTION');
  expect(rootElement.textContent).toContain('No relayer activity recorded');
  expect(rootElement.textContent).toContain('Live connection');
  const select = rootElement.querySelector('select')!;
  expect(select.value).toBe('');
  await act(async () => {
    select.value = address;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(context.setSelectedRelayer).toHaveBeenLastCalledWith(address);
  context = { ...context, selectedRelayer: address, observation: undefined, relayers: [] };
  await render();
  expect(select.value).toBe(address);
  expect(select.options[1].textContent).toContain('unavailable');
  expect(rootElement.textContent).toContain('Awaiting relayer pickup');
  await act(async () => {
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(context.setSelectedRelayer).toHaveBeenLastCalledWith('');
});

it('explains relaying without a second progress tracker and keeps exact timings collapsed', async () => {
  await render({
    originConfirmation: { confirmed: false, tracked: true, current: 4, required: 15 },
  });
  expect(rootElement.querySelectorAll('[aria-label="How relaying works"] > li')).toHaveLength(3);
  expect(rootElement.querySelector('[aria-label="Delivery stages"]')).toBeNull();
  expect(rootElement.textContent).toContain('Building verification proof');
  const timings = rootElement.querySelector('[aria-label="Stage timings"]')!;
  expect(timings.querySelectorAll('dt')).toHaveLength(6);
  expect(timings.textContent).toContain('+1s');
  expect(timings.textContent).toContain('Relayer observed');
  expect(timings.closest('details')?.open).toBe(false);

  await render({ waitingForLiquidity: true });
  expect(rootElement.textContent).toContain('Waiting for destination liquidity');
  await render({ paused: true });
  expect(rootElement.textContent).toContain('Delivery paused');
  context.observation = { ...observation, state: { ...observation.state, phase: 'retrying' } };
  await render();
  expect(rootElement.textContent).toContain('Waiting for next relay attempt');
  context.observation = undefined;
  await render({
    originConfirmation: { confirmed: false, tracked: true, current: 4, required: 15 },
  });
  expect(rootElement.textContent).toContain('Waiting for origin confirmations');
});

it('does not claim indexed delivery or finality from a relayer report', async () => {
  context.observation = { ...observation, state: { ...observation.state, phase: 'delivered' } };
  await render();
  expect(rootElement.textContent).toContain('Delivery reported · awaiting indexed confirmation');
  const delivered = {
    ...message,
    status: MessageStatus.Delivered,
    destination: { timestamp: 5000 },
  } as MessageStub;
  await render({ message: delivered });
  expect(rootElement.textContent).toContain('Delivered · awaiting destination confirmations');
  expect(rootElement.querySelector('[aria-label="Stage timings"]')?.textContent).toContain('+4s');
  await render({ message: { ...delivered, isPiMsg: true } });
  expect(rootElement.textContent).not.toContain('awaiting destination confirmations');
  await render({ message: delivered, confirmed: true, paused: true });
  expect(rootElement.textContent).toContain('Delivery confirmed');
  expect(rootElement.textContent).not.toContain('Delivery paused');
});
