import Link from 'next/link';

export function MissingChainConfigToast({
  chainId,
  domainId,
}: {
  chainId: number;
  domainId: number;
}) {
  const errorDesc = chainId
    ? `chain ID: ${chainId}`
    : domainId
    ? `domain ID: ${domainId}`
    : 'unknown message chain';
  return (
    <div>
      <span>{`No chain config found for ${errorDesc}. `}</span>
      <Link href="/settings" className="underline">
        Add a config
      </Link>
    </div>
  );
}
