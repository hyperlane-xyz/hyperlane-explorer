import { memo, type SVGProps } from 'react';

function _MessageIcon({ width = 16, height = 16, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x={1.5} y={3} width={13} height={10} rx={1.5} />
      <path d="m2 4 6 4.5L14 4" />
    </svg>
  );
}

export const MessageIcon = memo(_MessageIcon);
