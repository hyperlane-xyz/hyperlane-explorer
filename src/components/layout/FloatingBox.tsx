import { PropsWithChildren } from 'react';

interface Props {
  width?: string;
  maxWidth?: string;
  classes?: string;
}

export function FloatingBox(props: PropsWithChildren<Props>) {
  const { width, maxWidth, classes } = props;
  return (
    <div
      style={{ maxHeight: '80%' }}
      className={`${width} ${maxWidth} p-4 bg-white shadow-md rounded-lg overflow-auto ${classes}`}
    >
      {props.children}
    </div>
  );
}
