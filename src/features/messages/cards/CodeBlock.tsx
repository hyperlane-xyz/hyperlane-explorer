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
    <div className="relative mt-1.5 min-h-[1.5rem] max-w-full break-words rounded bg-gray-150 px-2 py-1.5 pr-8 font-mono text-sm font-light">
      {value}
      <CopyButton
        copyValue={value}
        width={12}
        height={12}
        className="absolute right-2 top-1.5 opacity-50"
      />
    </div>
  );
}
