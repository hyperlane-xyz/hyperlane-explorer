import { useEffect, useState } from 'react';

import { getHumanReadableTimeString } from '../../utils/time';

type TimeElapsedProps = {
  timestamp: number;
};

const TimeElapsed = ({ timestamp }: TimeElapsedProps) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setCount((count) => count + 1), 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return <span key={count}>{getHumanReadableTimeString(timestamp)}</span>;
};

export default TimeElapsed;
