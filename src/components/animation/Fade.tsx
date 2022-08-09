import { PropsWithChildren, useEffect, useState } from 'react';

export function Fade(props: PropsWithChildren<{ show: boolean }>) {
  const { show, children } = props;
  const [render, setRender] = useState(show);

  useEffect(() => {
    if (show) setRender(true);
  }, [show]);

  const onAnimationEnd = () => {
    if (!show) setRender(false);
  };

  return render ? (
    <div
      style={{
        animation: `${show ? 'fadeIn' : 'fadeOut'} 1s`,
        position: 'relative',
      }}
      onAnimationEnd={onAnimationEnd}
    >
      {children}
    </div>
  ) : null;
}
