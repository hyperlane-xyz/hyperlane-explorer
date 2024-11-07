export function MissingChainConfigToast({ domainId }: { domainId: number }) {
  return (
    <div>
      <span>{`No chain config found for domain ${domainId}. You can add a config in the origin/destination chain selector.`}</span>
    </div>
  );
}
