import type { SVGProps } from 'react';

export function ActivityIcon({ width = 16, height = 16, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M3 4.5v2M3 9.5v2M6.5 3h7M6.5 8h5M6.5 13h7" />
      <circle cx={3} cy={3} r={1.5} />
      <circle cx={3} cy={8} r={1.5} />
      <circle cx={3} cy={13} r={1.5} />
    </svg>
  );
}
