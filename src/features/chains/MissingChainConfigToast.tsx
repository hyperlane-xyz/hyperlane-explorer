import Link from 'next/link';

export function MissingChainConfigToast({ chainId }: { chainId: number }) {
  return (
    <div>
      <span>No chain config found for chain ID: {chainId}. </span>
      <Link href="/settings" className="underline">
        Add a config
      </Link>
    </div>
  );
}
