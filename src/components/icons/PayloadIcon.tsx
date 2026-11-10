import type { SVGProps } from 'react';

export function PayloadIcon({ width = 16, height = 16, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="m8 1.5 6 3.25v6.5L8 14.5l-6-3.25v-6.5Z" />
      <path d="m2 4.75 6 3.5 6-3.5M8 8.25v6.25M5 3.125l6 3.5" />
    </svg>
  );
}
