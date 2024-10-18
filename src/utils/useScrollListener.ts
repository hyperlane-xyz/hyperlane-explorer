import { useCallback, useEffect, useRef, useState } from 'react';

export function useScrollThresholdListener(threshold: number, debounceTime = 200) {
  const [isAboveThreshold, setIsAbove] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

  const timeoutId = useRef<null | NodeJS.Timeout>(null);

  const handleScroll = useCallback(() => {
    if (isDebouncing) return; // Skip handling scroll when disabled

    if (window.scrollY > threshold && !isAboveThreshold) {
      setIsAbove(true);
      setIsDebouncing(true);
    } else if (window.scrollY <= threshold && isAboveThreshold) {
      setIsAbove(false);
      setIsDebouncing(true);
    }
  }, [threshold, isAboveThreshold, isDebouncing]);

  const debouncedHandleScroll = debounce(handleScroll, 20);

  useEffect(() => {
    if (isDebouncing && !timeoutId.current) {
      timeoutId.current = setTimeout(() => {
        setIsDebouncing(false);
        timeoutId.current = null;
      }, debounceTime);
    }

    window.addEventListener('scroll', debouncedHandleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', debouncedHandleScroll);
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, [debouncedHandleScroll, isDebouncing, debounceTime]);

  return isAboveThreshold;
}

function debounce(fn: () => void, delay: number) {
  let timeoutId: number;
  return function () {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(fn, delay);
  };
}
