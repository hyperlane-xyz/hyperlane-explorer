import type { SVGProps } from 'react';

export function PersonIcon({ width = 16, height = 16, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
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
      <circle cx={8} cy={5} r={2.5} />
      <path d="M3 14v-1a5 5 0 0 1 10 0v1" />
    </svg>
  );
}
