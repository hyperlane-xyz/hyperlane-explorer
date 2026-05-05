import clsx from 'clsx';

import type { IsmNode } from '../../queries/walkIsm';
import { AddressInline } from './AddressInline';

interface Props {
  node: IsmNode;
  chainName: string;
  level?: number;
  rootAnnotation?: string;
}

export function IsmConfigDisplay({ node, chainName, level = 0, rootAnnotation }: Props) {
  return (
    <IsmNodeView node={node} chainName={chainName} level={level} annotation={rootAnnotation} />
  );
}

function IsmNodeView({
  node,
  chainName,
  level,
  prefix,
  annotation,
}: {
  node: IsmNode;
  chainName: string;
  level: number;
  prefix?: string;
  annotation?: string;
}) {
  return (
    <div className={clsx(level > 0 && 'ml-3 border-l border-gray-200 pl-3')}>
      <IsmRow node={node} chainName={chainName} prefix={prefix} annotation={annotation} />
      {node.children?.map((child, idx) => (
        <IsmNodeView
          key={`${idx}-${child.label ?? child.node.address}`}
          node={child.node}
          chainName={chainName}
          level={level + 1}
          prefix={child.label}
        />
      ))}
    </div>
  );
}

function IsmRow({
  node,
  chainName,
  prefix,
  annotation,
}: {
  node: IsmNode;
  chainName: string;
  prefix?: string;
  annotation?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
      {prefix && <span className="font-bold text-gray-600">{prefix}</span>}
      <span className="font-bold text-gray-800">{node.typeLabel}</span>
      {node.address ? (
        <AddressInline address={node.address} chainName={chainName} />
      ) : (
        <span className="text-xs italic text-gray-400">no address</span>
      )}
      {annotation && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
          {annotation}
        </span>
      )}
      {node.error && <span className="text-xs italic text-amber-700">({node.error})</span>}
    </div>
  );
}
