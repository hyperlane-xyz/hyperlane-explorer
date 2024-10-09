import { memo } from 'react';

import { IconButton, QuestionMarkIcon } from '@hyperlane-xyz/widgets';

import { Color } from '../../styles/Color';

function _HelpIcon({ text, size = 16 }: { text: string; size?: number }) {
  const tooltipProps = {
    'data-tooltip-content': text,
    'data-tooltip-id': 'root-tooltip',
    'data-tooltip-place': 'top-start',
  };
  return (
    // @ts-ignore allow pass-thru tooltip props
    <IconButton
      title="Help"
      width={size}
      height={size}
      className="border border-gray-400 rounded-full p-px"
      {...tooltipProps}
    >
      <QuestionMarkIcon height={size} width={size} color={Color.lightGray} className="opacity-50" />
    </IconButton>
  );
}

export const HelpIcon = memo(_HelpIcon);
