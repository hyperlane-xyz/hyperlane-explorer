import { CopyButton } from '@hyperlane-xyz/widgets';

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
    <div className="relative mt-1.5 min-h-[1.5rem] max-w-full rounded-md bg-[#e5e7eb] px-3 py-2 pr-8 font-mono text-sm font-light break-words">
      {value}
      <CopyButton
        copyValue={value}
        width={12}
        height={12}
        className="absolute top-1.5 right-2 opacity-50"
      />
    </div>
  );
}
