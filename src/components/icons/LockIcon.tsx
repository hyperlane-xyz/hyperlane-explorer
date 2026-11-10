import type { SVGProps } from 'react';

export function LockIcon({ width = 16, height = 16, ...props }: SVGProps<SVGSVGElement>) {
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
      <rect x={3} y={7} width={10} height={7} rx={1.5} />
      <path d="M5 7V4.5a3 3 0 0 1 6 0V7M8 10v1.5" />
    </svg>
  );
}
