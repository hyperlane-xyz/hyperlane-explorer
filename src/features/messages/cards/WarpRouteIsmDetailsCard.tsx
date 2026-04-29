import { ChevronIcon, LockIcon, SpinnerIcon, Tooltip } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useState } from 'react';

import { Card } from '../../../components/layout/Card';
import { useChainMetadataResolver } from '../../../metadataStore';
import { useMultiProvider } from '../../../store';
import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { getChainDisplayName } from '../../chains/utils';
import type { WarpRouteIsmSide, WarpRouteIsmSideResult } from '../queries/fetchWarpRouteIsm';
import { useWarpRouteIsm } from '../queries/useWarpRouteIsm';
import { IsmConfigDisplay } from './ismRender/IsmConfigDisplay';
import { OwnerDisplay } from './ismRender/OwnerDisplay';

interface Props {
  message: Message | MessageStub;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpRouteIsmDetailsCard({ message, warpRouteDetails, blur }: Props) {
  const multiProvider = useMultiProvider();
  const chainMetadataResolver = useChainMetadataResolver();
  const [isExpanded, setIsExpanded] = useState(false);

  const originChainName = multiProvider.tryGetChainName(message.originDomainId) ?? undefined;
  const destinationChainName =
    multiProvider.tryGetChainName(message.destinationDomainId) ?? undefined;
  const originDisplay = getChainDisplayName(chainMetadataResolver, originChainName);
  const destinationDisplay = getChainDisplayName(chainMetadataResolver, destinationChainName);

  const { data, isLoading, error } = useWarpRouteIsm({
    originChainName,
    originTokenAddress: warpRouteDetails?.originToken.addressOrDenom,
    destinationChainName,
    destinationTokenAddress: warpRouteDetails?.destinationToken.addressOrDenom,
    enabled: isExpanded,
  });

  if (!warpRouteDetails) return null;

  return (
    <Card className={clsx('w-full', blur && 'blur-xs')}>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Warp Route Security`}
            className="flex items-center gap-2"
          >
            <LockIcon width={22} height={26} color="#3d304c" className="opacity-70" />
            <h3 className="text-md font-medium text-primary-800">Warp Route Security</h3>
          </button>
          <Tooltip
            id="warp-route-ism-info"
            content="ISM configuration and ownership for the warp route's origin and destination tokens."
          />
        </div>
        <button
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} Warp Route Security`}
        >
          <ChevronIcon
            width={20}
            height={20}
            direction={isExpanded ? 'n' : 's'}
            className="text-gray-400"
          />
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-5">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <SpinnerIcon width={16} height={16} />
              Loading ISM configuration...
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">
              Failed to load ISM details: {error}
            </div>
          )}

          {data && !isLoading && (
            <>
              <SidePane label="Origin" chainDisplayName={originDisplay} side={data.origin} />
              <SidePane
                label="Destination"
                chainDisplayName={destinationDisplay}
                side={data.destination}
              />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function SidePane({
  label,
  chainDisplayName,
  side,
}: {
  label: string;
  chainDisplayName: string;
  side: WarpRouteIsmSideResult;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-base font-bold text-gray-900">
        {label} · {chainDisplayName}
      </h4>
      <SidePaneBody side={side} />
    </div>
  );
}

function SidePaneBody({ side }: { side: WarpRouteIsmSideResult }) {
  if (side.kind === 'unsupported') {
    return (
      <div className="text-sm text-gray-500">
        ISM details not available for {side.protocol} chains.
      </div>
    );
  }
  if (side.kind === 'error') {
    return (
      <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{side.value.error}</div>
    );
  }
  return <SideData data={side.value} />;
}

function SideData({ data }: { data: WarpRouteIsmSide }) {
  return (
    <div className="space-y-2">
      <OwnerDisplay
        owner={data.owner}
        ownerKind={data.ownerKind}
        safeInfo={data.safeInfo}
        chainName={data.chainName}
      />
      {data.ismError && !data.ismTree && (
        <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Could not derive ISM config: {data.ismError}
        </div>
      )}
      {data.ismTree && (
        <IsmConfigDisplay
          node={data.ismTree}
          chainName={data.chainName}
          rootAnnotation={data.ismSource === 'mailbox-default' ? 'mailbox default' : undefined}
        />
      )}
    </div>
  );
}
