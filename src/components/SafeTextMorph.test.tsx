/**
 * @jest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { SafeTextMorph } from './SafeTextMorph';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let shouldThrow = false;

jest.mock('torph/react', () => ({
  TextMorph: ({
    children,
    as: Tag = 'span',
    ...props
  }: any) => {
    if (shouldThrow) {
      throw new Error('TextMorph animation error');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactLib = require('react');
    return ReactLib.createElement(Tag, props, children);
  },
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  shouldThrow = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('SafeTextMorph', () => {
  it('renders children string correctly', () => {
    act(() => {
      root.render(<SafeTextMorph>Hello World</SafeTextMorph>);
    });
    expect(container.textContent).toBe('Hello World');
  });

  it('renders fallback when TextMorph throws', () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    shouldThrow = true;

    act(() => {
      root.render(<SafeTextMorph>Fallback Text</SafeTextMorph>);
    });

    expect(container.textContent).toBe('Fallback Text');
    const span = container.querySelector('span');
    expect(span).not.toBeNull();

    consoleSpy.mockRestore();
  });

  it('handles empty string', () => {
    act(() => {
      root.render(<SafeTextMorph>{''}</SafeTextMorph>);
    });
    expect(container.textContent).toBe('');
  });

  it('coerces number to string', () => {
    act(() => {
      root.render(<SafeTextMorph>{42}</SafeTextMorph>);
    });
    expect(container.textContent).toBe('42');
  });
});
