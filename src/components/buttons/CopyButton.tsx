import CopyIcon from '../../images/icons/copy-stack.svg';
import { tryClipboardSet } from '../../utils/clipboard';

import { IconButton, IconButtonProps } from './IconButton';

type Props = IconButtonProps & {
  copyValue: string;
};

export function CopyButton(props: Props) {
  const onClick = async () => {
    await tryClipboardSet(props.copyValue);
  };

  return (
    <IconButton imgSrc={CopyIcon} title="Copy" onClick={onClick} {...props} />
  );
}
