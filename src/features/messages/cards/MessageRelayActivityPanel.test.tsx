/** @jest-environment jsdom */
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { MessageStatus, type MessageStub } from '../../../types';
import { useMessageDiagnosticsContext } from '../diagnostics/MessageDiagnosticsContext';
import { MessageRelayActivityPanel } from './MessageRelayActivityPanel';

jest.mock('@hyperlane-xyz/utils', () => ({ shortenAddress: (value: string) => value }));
jest.mock('@hyperlane-xyz/widgets', () => ({ CopyButton: () => null }));
jest.mock('../diagnostics/MessageDiagnosticsContext');
jest.mock('../../../components/icons/ChainLogo', () => ({ ChainLogo: () => null }));
jest.mock('../../../metadataStore', () => ({
  useChainMetadataResolver: () => ({ tryGetChainName: () => undefined }),
}));

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
  expect(rootElement.textContent).toContain('Live');
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
  expect(rootElement.textContent).toContain('Relayer report unavailable');
  await act(async () => {
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(context.setSelectedRelayer).toHaveBeenLastCalledWith('');
});

it('shows parallel origin and relayer work, with timing details on demand', async () => {
  await render({
    originConfirmation: { confirmed: false, tracked: true, current: 4, required: 15 },
  });
  const route = rootElement.querySelector('[aria-label="Message relay route"]')!;
  expect(route.children).toHaveLength(3);
  expect(route.querySelectorAll('button')).toHaveLength(6);
  expect(route.querySelectorAll('[data-status="active"]')).toHaveLength(2);
  expect(route.textContent).toContain('4/15');
  expect(route.textContent).toContain('+1s');
  expect(rootElement.querySelector('section[aria-label$="timing details"]')).toBeNull();
  await act(async () => {
    rootElement
      .querySelector<HTMLButtonElement>('[aria-label="Picked up timing details"]')!
      .click();
  });
  expect(rootElement.querySelector('section[aria-label$="timing details"]')?.textContent).toContain(
    'Relayer observed',
  );
  expect(rootElement.querySelector('section[aria-label$="timing details"]')?.textContent).toContain(
    'Fast relayers can begin before origin confirmations',
  );

  context.observation = {
    ...observation,
    state: { ...observation.state, phase: 'ready_to_submit', phase_started_at_millis: 4000 },
  };
  await render();
  await act(async () => {
    route.querySelector<HTMLButtonElement>('[aria-label="Validated timing details"]')!.click();
  });
  expect(rootElement.querySelector('section[aria-label$="timing details"]')?.textContent).toContain(
    '2s after pickup',
  );
  context.observation = observation;
  await render({ waitingForLiquidity: true });
  expect(rootElement.textContent).toContain('Waiting for destination liquidity');
  expect(
    route.querySelector('[aria-label="Validated timing details"] .motion-safe\\:animate-spin'),
  ).toBeNull();
  await render({
    paused: true,
    originConfirmation: { confirmed: false, tracked: true, current: 4, required: 15 },
  });
  expect(rootElement.textContent).toContain('Delivery paused');
  expect(
    route.querySelector(
      '[aria-label="Origin confirmed timing details"] .motion-safe\\:animate-spin',
    ),
  ).not.toBeNull();
  expect(
    route.querySelector('[aria-label="Validated timing details"] .motion-safe\\:animate-spin'),
  ).toBeNull();
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
  expect(rootElement.textContent).toContain('Delivery reported · awaiting chain data');
  const delivered = {
    ...message,
    status: MessageStatus.Delivered,
    destination: { timestamp: 5000 },
  } as MessageStub;
  await render({ message: delivered });
  expect(rootElement.textContent).toContain('Confirming destination');
  expect(rootElement.querySelector('[aria-label="Message relay route"]')?.textContent).toContain(
    '+4s',
  );
  await render({ message: { ...delivered, isPiMsg: true } });
  expect(rootElement.textContent).not.toContain('Confirming destination');
  await render({ message: delivered, confirmed: true, paused: true });
  expect(rootElement.textContent).toContain('Delivery confirmed');
  expect(rootElement.textContent).not.toContain('Delivery paused');
  context.observation = undefined;
  await render({ message: delivered, confirmed: true });
  expect(rootElement.textContent).toContain('Not reported');
  expect(rootElement.textContent).not.toContain('Awaiting relayer pickup');
});

it('keeps a late relayer recheck separate from chain confirmation time', async () => {
  context.observation = {
    ...observation,
    state: { ...observation.state, phase: 'delivered', delivered_observed_at_millis: 615400 },
  };
  await render({
    message: {
      ...message,
      status: MessageStatus.Delivered,
      destination: { timestamp: 5000 },
    } as MessageStub,
    confirmed: true,
  });
  const route = rootElement.querySelector('[aria-label="Message relay route"]')!;
  expect(route.textContent).toContain('+4s');
  expect(route.textContent).not.toContain('10m');
  const button = route.querySelector<HTMLButtonElement>(
    '[aria-label="Confirmation timing details"]',
  )!;
  expect(button.textContent).toContain('Confirmed');
  await act(async () => button.click());
  const detail = rootElement.querySelector('section[aria-label$="timing details"]');
  expect(detail?.textContent).toContain('Relayer checked delivery');
  expect(detail?.textContent).toContain('+10m 14.4s from dispatch');
  expect(detail?.textContent).toContain('tracked separately');
});
