/** @jest-environment jsdom */
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageTechnicalDetails } from './MessageTechnicalDetails';

jest.mock('@hyperlane-xyz/widgets', () => ({
  ShieldIcon: () => null,
  WideChevronIcon: () => null,
}));

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

it('shows Security first and retains selected tabs and lazy Warp content across updates', async () => {
  reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const detailsMount = jest.fn();
  const detailsUnmount = jest.fn();
  function Details() {
    useEffect(() => {
      detailsMount();
      return detailsUnmount;
    }, []);
    return <input aria-label="Retained detail" defaultValue="initial" />;
  }
  const render = (messageId: string, hidden = false, revision = 0, hasWarp = true) =>
    act(async () => {
      root.render(
        <MessageTechnicalDetails
          key={messageId}
          hidden={hidden}
          security={<p>Security tree {revision}</p>}
          activity={<p>Activity log</p>}
          warpRoute={hasWarp && <Details />}
        />,
      );
    });
  const clickTab = (label: string) =>
    act(async () => {
      const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (element) => element.textContent === label,
      );
      expect(tab).toBeDefined();
      tab?.click();
    });
  await render('first', false, 0, false);
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
  await clickTab('Relayer activity');
  await render('first');
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Relayer activity',
  );
  await clickTab('Security');
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('section')?.hidden).toBe(false);
  expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
    'Security',
    'Relayer activity',
    'Warp route',
  ]);
  expect(detailsMount).not.toHaveBeenCalled();
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Security',
  );
  await clickTab('Security');
  expect(detailsMount).not.toHaveBeenCalled();
  await clickTab('Warp route');
  expect(detailsMount).toHaveBeenCalledTimes(1);
  const input = container.querySelector('input')!;
  input.value = 'retained';
  await clickTab('Security');
  await render('first', true, 1);
  expect(container.querySelector('section')?.hidden).toBe(true);
  await render('first', false, 2);
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Security',
  );
  expect(container.textContent).toContain('Security tree 2');
  await clickTab('Warp route');
  expect(container.querySelector('input')?.value).toBe('retained');
  expect(detailsMount).toHaveBeenCalledTimes(1);
  await render('second');
  expect(detailsUnmount).toHaveBeenCalledTimes(1);
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Security',
  );
  await act(async () => root.unmount());
  container.remove();
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
