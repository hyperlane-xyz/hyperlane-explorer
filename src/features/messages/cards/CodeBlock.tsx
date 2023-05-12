import { CopyButton } from '../../../components/buttons/CopyButton';

export function LabelAndCodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm text-gray-500">{label}</label>
      <CodeBlock value={value} />
    </div>
  );
}

export function CodeBlock({ value }: { value: string }) {
  return (
    <div className="relative max-w-full break-words py-2 pl-2 pr-9 mt-2 min-h-[2rem] bg-gray-100 text-sm font-mono rounded">
      {value}
      <CopyButton
        copyValue={value}
        width={13}
        height={13}
        classes="absolute top-2 right-2 opacity-70"
      />
    </div>
  );
}
