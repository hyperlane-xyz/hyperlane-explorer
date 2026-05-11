import { useInterval } from '@hyperlane-xyz/widgets';
import { useCallback } from 'react';

import { isWindowVisible } from './window';

export function useVisibleInterval(callback: () => void, delay: number) {
  const visibleCallback = useCallback(() => {
    if (!isWindowVisible()) return;
    callback();
  }, [callback]);

  useInterval(visibleCallback, delay);
}
