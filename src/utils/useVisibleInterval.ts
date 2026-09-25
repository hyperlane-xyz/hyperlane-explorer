import { useInterval } from '@hyperlane-xyz/widgets';
import { useCallback, useEffect } from 'react';

import { isWindowVisible } from './window';

export function useVisibleInterval(
  callback: () => void,
  delay: number | null,
  refreshOnVisible = false,
) {
  const visibleCallback = useCallback(() => {
    if (!isWindowVisible()) return;
    callback();
  }, [callback]);

  useInterval(visibleCallback, delay);

  useEffect(() => {
    if (!refreshOnVisible) return;

    document.addEventListener('visibilitychange', visibleCallback);
    return () => document.removeEventListener('visibilitychange', visibleCallback);
  }, [refreshOnVisible, visibleCallback]);
}
