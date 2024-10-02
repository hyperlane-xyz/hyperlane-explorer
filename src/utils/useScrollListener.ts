import { useEffect, useState } from 'react';

export function useScrollThresholdListener(threshold: number, debounce = 500) {
  const [isAboveThreshold, setIsAbove] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null;

    const listener = () => {
      if (isDebouncing) {
        if (!timeoutId) {
          setTimeout(() => {
            setIsDebouncing(false);
            timeoutId = null;
          }, debounce);
        }
        return;
      }

      if (window.scrollY > threshold && !isAboveThreshold) {
        setIsAbove(true);
        setIsDebouncing(true);
      } else if (window.scrollY <= threshold && isAboveThreshold) {
        setIsAbove(false);
        setIsDebouncing(true);
      }
    };

    window.addEventListener('scroll', listener, { passive: true });
    return () => {
      window.removeEventListener('scroll', listener);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [threshold, debounce, isAboveThreshold, isDebouncing]);

  return isAboveThreshold;
}
