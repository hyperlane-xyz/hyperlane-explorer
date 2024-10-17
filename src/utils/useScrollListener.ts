import { useCallback, useEffect, useState } from 'react';

export function useScrollThresholdListener(threshold: number, debounceTime = 500) {
  const [isAboveThreshold, setIsAbove] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);

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

  useEffect(() => {
    const debouncedHandleScroll = debounce(handleScroll, 30);

    if (!isDebouncing) {
      window.addEventListener('scroll', debouncedHandleScroll);
    } else {
      // Disabling scroll completly if it stills debouncing to prevent looping
      const timeoutId = setTimeout(() => {
        setIsDebouncing(false);
      }, debounceTime);

      return () => clearTimeout(timeoutId);
    }

    return () => {
      window.removeEventListener('scroll', debouncedHandleScroll);
    };
  }, [handleScroll, isDebouncing, debounceTime]);

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
