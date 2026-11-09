import { WideChevronIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { memo } from 'react';

import styles from './SendIcon.module.css';

function _SendIcon({
  size = 18,
  active = false,
  className,
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-flex items-center gap-0.5', active && styles.sending, className)}
    >
      <WideChevronIcon
        width={size * 0.6}
        height={size}
        direction="e"
        color="currentColor"
        rounded
      />
      <WideChevronIcon
        width={size * 0.6}
        height={size}
        direction="e"
        color="currentColor"
        rounded
      />
    </span>
  );
}

export const SendIcon = memo(_SendIcon);
