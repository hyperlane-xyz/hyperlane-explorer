import type { TokenArgs } from '@hyperlane-xyz/sdk';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { useMemo } from 'react';

import { TokenIcon } from '../../../components/icons/TokenIcon';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../../metadataStore';
import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { getBlockExplorerAddressUrl } from '../../../utils/url';
import { isCollateralRoute } from '../collateral/utils';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message | MessageStub;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpTransferDetailsCard({ message, warpRouteDetails, blur }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();
  const blockExplorerAddressUrls = useMemo(() => {
    if (!warpRouteDetails) {
      return {
        originToken: null,
        destinationToken: null,
        transferRecipient: null,
      };
    }

    const { originToken, destinationToken, transferRecipient } = warpRouteDetails;

    return {
      originToken: getBlockExplorerAddressUrl(
        chainMetadataResolver,
        message.originDomainId,
        originToken.addressOrDenom,
      ),
      destinationToken: getBlockExplorerAddressUrl(
        chainMetadataResolver,
        message.destinationDomainId,
        destinationToken.addressOrDenom,
      ),
      transferRecipient: getBlockExplorerAddressUrl(
        chainMetadataResolver,
        message.destinationDomainId,
        transferRecipient,
      ),
    };
  }, [
    chainMetadataResolver,
    message.destinationDomainId,
    message.originDomainId,
    warpRouteDetails,
  ]);

  if (!warpRouteDetails) return null;

  const { amount, transferRecipient, originToken, destinationToken } = warpRouteDetails;
  const isCollateral = isCollateralRoute(destinationToken.standard);
  const isDifferentToken =
    originToken.symbol !== destinationToken.symbol ||
    originToken.logoURI !== destinationToken.logoURI;

  return (
    <SectionCard
      className="w-full"
      title="Warp Transfer Details"
      icon={
        <Tooltip
          id="warp-route-info"
          content="Information about the warp route transfer such as the end recipient and amount transferred"
        />
      }
    >
      <div className="flex gap-4 sm:gap-6">
        {/* Token Logo Column */}
        <TokenLogos
          originToken={originToken}
          destinationToken={destinationToken}
          isDifferentToken={isDifferentToken}
        />
        {/* Details Column */}
        <div className="min-w-0 flex-1 space-y-4">
          {isCollateral && (
            <div className="rounded bg-primary-50 px-3 py-2 text-xs text-primary-700">
              <span className="font-medium">Collateral-backed route:</span> This transfer uses
              locked collateral on the destination chain
            </div>
          )}
          <div className="space-y-2">
            <KeyValueRow
              label="Amount:"
              labelWidth="w-40 sm:w-48"
              display={`${amount} ${originToken.symbol}`}
              blurValue={blur}
              showCopy
            />
            <KeyValueRow
              label={`Origin token (${originToken.symbol}):`}
              labelWidth="w-40 sm:w-48"
              display={originToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls.originToken}
              showCopy
            />
            <KeyValueRow
              label={`Destination token (${destinationToken.symbol}):`}
              labelWidth="w-40 sm:w-48"
              display={destinationToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls.destinationToken}
              showCopy
            />
            <KeyValueRow
              label="Transfer recipient:"
              labelWidth="w-40 sm:w-48"
              display={transferRecipient}
              blurValue={blur}
              link={blockExplorerAddressUrls.transferRecipient}
              showCopy
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function TokenLogos({
  originToken,
  destinationToken,
  isDifferentToken,
}: {
  originToken: TokenArgs;
  destinationToken: TokenArgs;
  isDifferentToken: boolean;
}) {
  const hasOriginLogo = !!originToken.logoURI;
  const hasDestLogo = !!destinationToken.logoURI;

  if (!hasOriginLogo && !hasDestLogo) return null;

  if (!isDifferentToken) {
    const token = hasOriginLogo ? originToken : destinationToken;
    return (
      <div className="flex flex-shrink-0 items-center justify-center">
        <TokenIcon token={token} size={80} />
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center justify-center">
      <div className="relative" style={{ width: 73, height: 73 }}>
        <div className="absolute left-0 top-0">
          <TokenIcon token={originToken} size={48} />
        </div>
        <div className="absolute bottom-0 right-0 rounded-full ring-2 ring-white">
          <TokenIcon token={destinationToken} size={48} />
        </div>
      </div>
    </div>
  );
}
