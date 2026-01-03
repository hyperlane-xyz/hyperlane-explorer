import { PropsWithChildren, ReactElement } from 'react';

interface ButtonProps {
  color?: 'white' | 'primary' | 'green' | 'red' | 'accent';
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
    bold = true,
    icon,
    disabled,
    title,
    passThruProps,
  } = props;
  const color = _color ?? 'primary';

  const base = 'flex items-center justify-center rounded-full transition-all duration-500';
  let baseColors, onHover, onActive;
  if (color === 'primary') {
    baseColors = 'bg-primary-500 text-white';
    onHover = 'hover:bg-primary-600';
    onActive = 'active:bg-primary-700';
  } else if (color === 'accent') {
    baseColors = 'bg-accent-500 text-white';
    onHover = 'hover:bg-accent-600';
    onActive = 'active:bg-accent-700';
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
