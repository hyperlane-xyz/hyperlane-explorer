import { memo } from 'react';



import Question from '../../images/icons/question-circle.svg';
import { IconButton } from '../buttons/IconButton';


function _HelpIcon({ text, size = 20 }: { text: string; size?: number }) {
  return (
    <IconButton
      imgSrc={Question}
      title="Help"
      width={size}
      height={size}
      classes="opacity-50"
      passThruProps={{
        'data-tooltip-content': text,
        'data-tooltip-id': 'root-tooltip',
        'data-tooltip-place': 'top-start',
      }}
    />
  );
}

export const HelpIcon = memo(_HelpIcon);