import { memo } from 'react';

import { Color } from '../../styles/Color';

import { chevronDirectionToClass } from './Chevron';

interface Props {
  width?: string | number;
  height?: string | number;
  direction: 'n' | 'e' | 's' | 'w';
  color?: string;
  classes?: string;
}

function _WideChevronIcon({ width, height, direction, color, classes }: Props) {
  const directionClass = chevronDirectionToClass(direction);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120.3 190"
      width={width}
      height={height}
      className={`${directionClass} ${classes}`}
      fill={color || Color.primaryBlack}
    >
      <path d="M4.4 0h53c7.2 0 13.7 3 16.2 7.7l46.5 85.1a2 2 0 0 1 0 2l-.2.5-46.3 87c-2.5 4.6-9 7.7-16.3 7.7h-53c-3 0-5-2-4-4L48 92.9.4 4c-1-2 1-4 4-4Z" />
    </svg>
  );
}

export const WideChevronIcon = memo(_WideChevronIcon);
