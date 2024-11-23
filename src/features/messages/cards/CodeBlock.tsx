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
    <div className="relative mt-2 min-h-[2rem] max-w-full break-words rounded bg-gray-100 py-2 pl-2 pr-9 font-mono text-sm">
      {value}
      <CopyButton
        copyValue={value}
        width={13}
        height={13}
        className="absolute right-2 top-2 opacity-50"
      />
    </div>
  );
}
