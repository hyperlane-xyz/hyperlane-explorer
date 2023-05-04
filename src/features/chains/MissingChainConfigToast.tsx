import Link from 'next/link';

export function MissingChainConfigToast({
  chainId,
  domainId,
}: {
  chainId: number;
  domainId: number;
}) {
  return (
    <div>
      <span>
        {chainId
          ? `No chain config found for chain ID: {chainId}. `
          : `No known chain ID for domain ${domainId}. `}
      </span>
      <Link href="/settings" className="underline">
        Add a config
      </Link>
    </div>
  );
}
