import { PropsWithChildren, ReactElement } from 'react';

interface ButtonProps {
  type?: 'submit' | 'reset' | 'button';
  onClick?: () => void;
  classes?: string;
  bold?: boolean;
  disabled?: boolean;
  icon?: ReactElement;
  title?: string;
  passThruProps?: any;
}

export function BorderedButton(props: PropsWithChildren<ButtonProps>) {
  const { type, onClick, classes, bold, icon, disabled, title, passThruProps } = props;

  const base = 'border border-black rounded transition-all';
  const onHover = 'hover:border-gray-500 hover:text-gray-500';
  const onDisabled = 'disabled:border-gray-300 disabled:text-gray-300';
  const onActive = 'active:border-gray-400 active:text-gray-400';
  const weight = bold ? 'font-semibold' : '';
  const allClasses = `${base} ${onHover} ${onDisabled} ${onActive} ${weight} ${classes}`;

  return (
    <button
      onClick={onClick}
      type={type ?? 'button'}
      disabled={disabled ?? false}
      title={title}
      className={allClasses}
      {...passThruProps}
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
