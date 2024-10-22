import { useEffect, useRef, useState } from 'react';

export function useScrollThresholdListener(threshold: number, debounce = 300) {
  const [isAboveThreshold, setIsAbove] = useState(false);

  const timeoutId = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const listener = () => {
      const handleScroll = () => {
        if (window.scrollY > threshold && !isAboveThreshold) {
          setIsAbove(true);
        } else if (window.scrollY <= threshold && isAboveThreshold) {
          setIsAbove(false);
        }
      };

      if (!timeoutId.current) {
        timeoutId.current = setTimeout(() => {
          handleScroll();
          timeoutId.current = null;
        }, debounce);
      }
    };

    window.addEventListener('scroll', listener, { passive: true });
    return () => {
      window.removeEventListener('scroll', listener);
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [threshold, debounce, isAboveThreshold]);

  return isAboveThreshold;
}
