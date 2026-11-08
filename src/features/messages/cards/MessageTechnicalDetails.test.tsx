/** @jest-environment jsdom */
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageTechnicalDetails } from './MessageTechnicalDetails';

const reactTestGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

it('shows Activity first and retains selected tabs and lazy details across updates', async () => {
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
  const render = (messageId: string, hidden = false, revision = 0) =>
    act(async () => {
      root.render(
        <MessageTechnicalDetails
          key={messageId}
          hidden={hidden}
          security={<p>Security tree {revision}</p>}
          activity={<p>Activity log</p>}
          details={<Details />}
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
  await render('first');
  expect(container.querySelector('details')).toBeNull();
  expect(container.querySelector('section')?.hidden).toBe(false);
  expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
    'Activity',
    'Security',
    'Details',
  ]);
  expect(detailsMount).not.toHaveBeenCalled();
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Activity',
  );
  await clickTab('Security');
  expect(detailsMount).not.toHaveBeenCalled();
  await clickTab('Details');
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
  await clickTab('Details');
  expect(container.querySelector('input')?.value).toBe('retained');
  expect(detailsMount).toHaveBeenCalledTimes(1);
  await render('second');
  expect(detailsUnmount).toHaveBeenCalledTimes(1);
  expect(container.querySelector('input')).toBeNull();
  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
    'Activity',
  );
  await act(async () => root.unmount());
  container.remove();
  delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
});
