import { CopyButton } from '../../../components/buttons/CopyButton';
import { isZeroish } from '../../../utils/number';

interface Props {
  label: string;
  labelWidth: string;
  display: string;
  displayWidth?: string;
  subDisplay?: string;
  showCopy?: boolean;
  blurValue?: boolean;
  classes?: string;
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
}: Props) {
  const isValueZeroish = isZeroish(display);
  return (
    <div className={`flex items-center pl-px ${classes}`}>
      <label className={`text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <div className={`text-sm ml-1 truncate ${displayWidth || ''} ${blurValue && 'blur-xs'}`}>
        <span>{!isValueZeroish ? display : 'Unknown'}</span>
        {subDisplay && !isValueZeroish && <span className="text-xs ml-2">{subDisplay}</span>}
      </div>
      {showCopy && !isValueZeroish && (
        <CopyButton copyValue={display} width={13} height={13} classes="ml-1" />
      )}
    </div>
  );
}
