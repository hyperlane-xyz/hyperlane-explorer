import { CopyButton } from '../../../components/buttons/CopyButton';

interface Props {
  label: string;
  labelWidth: string;
  display: string;
  displayWidth?: string;
  subDisplay?: string;
  showCopy?: boolean;
  blurValue?: boolean;
}

export function KeyValueRow({
  label,
  labelWidth,
  display,
  displayWidth,
  subDisplay,
  showCopy,
  blurValue,
}: Props) {
  return (
    <div className="flex items-center pl-px">
      <label className={`text-sm text-gray-500 ${labelWidth}`}>{label}</label>
      <div className={`text-sm ml-1 truncate ${displayWidth || ''} ${blurValue && 'blur-xs'}`}>
        <span>{display}</span>
        {subDisplay && <span className="text-xs ml-2">{subDisplay}</span>}
      </div>
      {showCopy && <CopyButton copyValue={display} width={13} height={13} classes="ml-1" />}
    </div>
  );
}
