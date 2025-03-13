import { isZeroish } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';

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
}: Props) {
  const useFallbackVal = isZeroish(display) && !allowZeroish;
  return (
    <div className={`flex items-center pl-px font-light ${classes}`}>
      <label className={`text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <div className={`ml-1 truncate text-sm ${displayWidth || ''} ${blurValue && 'blur-xs'}`}>
        <span>{!useFallbackVal ? display : 'Unknown'}</span>
        {subDisplay && !useFallbackVal && <span className="ml-2 text-xs">{subDisplay}</span>}
      </div>
      {showCopy && !useFallbackVal && (
        <CopyButton
          copyValue={display}
          width={13}
          height={13}
          className={`ml-1.5 opacity-60 ${copyButtonClasses}`}
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
