export function MissingChainConfigToast({
  domainId,
  chainId,
}: {
  domainId: number;
  chainId: number | string | null | undefined;
}) {
  const errorDesc = chainId
    ? `chain ID: ${chainId}`
    : domainId
    ? `domain ID: ${domainId}`
    : 'unknown message chain';
  return (
    <div>
      <span>{`No chain config found for ${errorDesc}. You can add a config in the origin/destination chain selector.`}</span>
    </div>
  );
}
