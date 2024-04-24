import { memo } from 'react';

import Question from '../../images/icons/question-circle.svg';
import { IconButton } from '../buttons/IconButton';

function _HelpIcon({ text, size = 20 }: { text: string; size?: number }) {
  // const onClick = () => {
  //   toast.info(text, { autoClose: 8000 });
  // };

  return (
    <IconButton
      imgSrc={Question}
      title="Help"
      width={size}
      height={size}
      // onClick={onClick}
      classes="opacity-50"
      passThruProps={{
        'data-tooltip-content': text,
        'data-tooltip-id': 'my-tooltip',
        'data-tooltip-place': 'top-start',
      }}
    />
  );
}

export const HelpIcon = memo(_HelpIcon);
