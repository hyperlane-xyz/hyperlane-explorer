import { memo } from 'react';

interface Props {
  width?: string | number;
  height?: string | number;
  direction: 'n' | 'e' | 's' | 'w';
  color?: string;
  classes?: string;
}

function _ChevronIcon({ width, height, direction, color, classes }: Props) {
  let className: string;
  switch (direction) {
    case 'n':
      className = 'rotate-180';
      break;
    case 'e':
      className = 'rotate-270';
      break;
    case 's':
      className = '';
      break;
    case 'w':
      className = 'rotate-90';
      break;
    default:
      throw new Error(`Invalid chevron direction ${direction}`);
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 14 8"
      className={`${className} ${classes}`}
    >
      <path
        d="M1 1l6 6 6-6"
        strokeWidth="2"
        stroke={color || '#2E3338'}
        fill="none"
        fillRule="evenodd"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const ChevronIcon = memo(_ChevronIcon);
