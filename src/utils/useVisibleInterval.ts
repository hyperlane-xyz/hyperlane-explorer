import { useInterval } from '@hyperlane-xyz/widgets';
import { useCallback, useEffect } from 'react';

import { isWindowVisible } from './window';

export function useVisibleInterval(callback: () => void, delay: number | null) {
  const visibleCallback = useCallback(() => {
    if (!isWindowVisible()) return;
    callback();
  }, [callback]);

  useInterval(visibleCallback, delay);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const refreshWhenVisible = () => {
      if (isWindowVisible()) callback();
    };

    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [callback]);
}
