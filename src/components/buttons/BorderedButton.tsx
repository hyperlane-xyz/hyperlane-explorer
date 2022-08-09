import { PropsWithChildren, ReactElement } from 'react';

interface ButtonProps {
  size?: 'xs' | 's' | 'm' | 'l' | 'xl';
  type?: 'submit' | 'reset' | 'button';
  onClick?: () => void;
  classes?: string;
  bold?: boolean;
  disabled?: boolean;
  icon?: ReactElement;
  title?: string;
}

export function BorderedButton(props: PropsWithChildren<ButtonProps>) {
  const { size, type, onClick, classes, bold, icon, disabled, title } = props;

  const base = 'border-2 border-black transition-all';
  const sizing = sizeToClasses(size);
  const onHover = 'hover:border-gray-500 hover:text-gray-500';
  const onDisabled = 'disabled:border-gray-300 disabled:text-gray-300';
  const onActive = 'active:border-gray-400 active:text-gray-400';
  const weight = bold ? 'font-semibold' : '';
  const allClasses = `${base} ${sizing} ${onHover} ${onDisabled} ${onActive} ${weight} ${classes}`;

  return (
    <button
      onClick={onClick}
      type={type ?? 'button'}
      disabled={disabled ?? false}
      title={title}
      className={allClasses}
    >
      {icon ? (
        <div className="flex items-center">
          {props.icon}
          {props.children}
        </div>
      ) : (
        <>{props.children}</>
      )}
    </button>
  );
}

function sizeToClasses(size?: string) {
  if (size === 'xs') return 'w-20 h-8 p-1 rounded';
  if (size === 's') return 'w-30 h-9 p-1 rounded';
  if (size === 'l') return 'w-44 h-12 p-1.5 text-lg rounded-lg';
  if (size === 'xl') return 'w-48 h-14 p-1.5 text-xl rounded-lg';
  return 'w-40 h-11 p-2 rounded-md'; // 'm' or other
}
