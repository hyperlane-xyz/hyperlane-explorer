import { memo, type SVGProps } from 'react';

function _SendIcon({ width = 20, height = 20, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m3 3 18 9-18 9 3-9-3-9Z" />
      <path d="M6 12h15" />
    </svg>
  );
}

export const SendIcon = memo(_SendIcon);
