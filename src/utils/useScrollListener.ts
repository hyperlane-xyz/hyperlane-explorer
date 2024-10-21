import { useEffect, useRef, useState } from 'react';

export function useScrollThresholdListener(threshold: number, debounce = 300) {
  const [isAboveThreshold, setIsAbove] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const listener = () => {
      const handleScroll = () => {
        if (isDebouncing) return;

        if (window.scrollY > threshold && !isAboveThreshold) {
          setIsAbove(true);
          setIsDebouncing(true);
        } else if (window.scrollY <= threshold && isAboveThreshold) {
          setIsAbove(false);
          setIsDebouncing(true);
        }
      };

      if (isDebouncing) {
        if (!timeoutId.current) {
          timeoutId.current = setTimeout(() => {
            setIsDebouncing(false);
            timeoutId.current = null;
            handleScroll();
          }, debounce);
        }
      } else {
        handleScroll();
      }
    };

    window.addEventListener('scroll', listener, { passive: true });
    return () => {
      window.removeEventListener('scroll', listener);
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [threshold, debounce, isAboveThreshold, isDebouncing]);

  return isAboveThreshold;
}
