import { useInterval } from '@hyperlane-xyz/widgets';

import { useVisibleInterval } from './useVisibleInterval';
import { isWindowVisible } from './window';

jest.mock('react', () => ({
  useCallback: (callback: () => void) => callback,
}));

jest.mock('@hyperlane-xyz/widgets', () => ({
  useInterval: jest.fn(),
}));

jest.mock('./window', () => ({
  isWindowVisible: jest.fn(),
}));

describe('useVisibleInterval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes the callback when the window is visible', () => {
    const callback = jest.fn();
    jest.mocked(isWindowVisible).mockReturnValue(true);

    useVisibleInterval(callback, 1000);
    const registeredCallback = jest.mocked(useInterval).mock.calls[0][0];
    registeredCallback();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('skips the callback when the window is hidden', () => {
    const callback = jest.fn();
    jest.mocked(isWindowVisible).mockReturnValue(false);

    useVisibleInterval(callback, 1000);
    const registeredCallback = jest.mocked(useInterval).mock.calls[0][0];
    registeredCallback();

    expect(callback).not.toHaveBeenCalled();
  });

  it('registers the new delay when delay changes', () => {
    const callback = jest.fn();

    useVisibleInterval(callback, 1000);
    useVisibleInterval(callback, 2000);

    expect(useInterval).toHaveBeenNthCalledWith(1, expect.any(Function), 1000);
    expect(useInterval).toHaveBeenNthCalledWith(2, expect.any(Function), 2000);
  });
});
