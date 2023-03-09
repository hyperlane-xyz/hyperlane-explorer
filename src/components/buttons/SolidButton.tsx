import { PropsWithChildren, ReactElement } from 'react';

interface ButtonProps {
  color?: 'white' | 'blue' | 'green' | 'red'; // defaults to blue
  type?: 'submit' | 'reset' | 'button';
  onClick?: () => void;
  classes?: string;
  bold?: boolean;
  disabled?: boolean;
  icon?: ReactElement;
  title?: string;
  passThruProps?: any;
}

export function SolidButton(props: PropsWithChildren<ButtonProps>) {
  const {
    type,
    onClick,
    color: _color,
    classes,
    bold,
    icon,
    disabled,
    title,
    passThruProps,
  } = props;
  const color = _color ?? 'blue';

  const base = 'flex items-center justify-center rounded transition-all duration-500';
  let baseColors, onHover, onActive;
  if (color === 'blue') {
    baseColors = 'bg-blue-500 text-white';
    onHover = 'hover:bg-blue-600';
    onActive = 'active:bg-blue-700';
  } else if (color === 'green') {
    baseColors = 'bg-green-500 text-white';
    onHover = 'hover:bg-green-600';
    onActive = 'active:bg-green-700';
  } else if (color === 'red') {
    baseColors = 'bg-red-600 text-white';
    onHover = 'hover:bg-red-500';
    onActive = 'active:bg-red-400';
  } else if (color === 'white') {
    baseColors = 'bg-white text-black';
    onHover = 'hover:bg-gray-100';
    onActive = 'active:bg-gray-200';
  }
  const onDisabled = 'disabled:bg-gray-300 disabled:text-gray-500';
  const weight = bold ? 'font-semibold' : '';
  const allClasses = `${base} ${baseColors} ${onHover} ${onDisabled} ${onActive} ${weight} ${classes}`;

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
        <div className="flex items-center justify-center">
          {props.icon}
          {props.children}
        </div>
      ) : (
        <>{props.children}</>
      )}
    </button>
  );
}
