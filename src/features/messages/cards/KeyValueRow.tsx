import { isZeroish } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';
import { truncateString } from '../../../utils/string';

interface Props {
  label: string;
  labelWidth: string;
  display: string;
  displayWidth?: string;
  subDisplay?: string;
  showCopy?: boolean;
  blurValue?: boolean;
  classes?: string;
  allowZeroish?: boolean;
  link?: string | null;
  copyButtonClasses?: string | null;
  truncateMiddle?: boolean;
}

export function KeyValueRow({
  label,
  labelWidth,
  display,
  displayWidth,
  subDisplay,
  showCopy,
  blurValue,
  classes,
  allowZeroish = false,
  link,
  copyButtonClasses = '',
  truncateMiddle = false,
}: Props) {
  const useFallbackVal = isZeroish(display) && !allowZeroish;
  const displayValue = !useFallbackVal
    ? truncateMiddle
      ? truncateString(display)
      : display
    : 'Unknown';

  return (
    <div className={`flex items-center gap-2 font-light ${classes}`}>
      <label className={`shrink-0 text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <div
        className={`min-w-0 flex-1 font-mono text-sm ${displayWidth || ''} ${blurValue && 'blur-xs'} ${!truncateMiddle && 'truncate'}`}
      >
        <span>{displayValue}</span>
        {subDisplay && !useFallbackVal && <span className="ml-2 text-xs">{subDisplay}</span>}
      </div>
      {showCopy && !useFallbackVal && (
        <CopyButton
          copyValue={display}
          width={12}
          height={12}
          className={`shrink-0 opacity-60 ${copyButtonClasses}`}
        />
      )}
      {link && <LinkIcon href={link} />}
    </div>
  );
}

function LinkIcon({ href }: { href: string }) {
  return (
    <a target="_blank" rel="noopener noreferrer" href={href}>
      <BoxArrowIcon width={13} height={13} className="ml-1.5" />
    </a>
  );
}
