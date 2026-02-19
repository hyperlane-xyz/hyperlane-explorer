import { CopyButton } from '@hyperlane-xyz/widgets';
import { useState } from 'react';

export function LabelAndCodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm text-gray-500">{label}</label>
      <CodeBlock value={value} />
    </div>
  );
}

export function CollapsibleLabelAndCodeBlock({
  label,
  value,
  defaultCollapsed = true,
}: {
  label: string;
  value: string;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <span className="text-xs">{collapsed ? '▶' : '▼'}</span>
        {label}
      </button>
      {!collapsed && <CodeBlock value={value} />}
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
