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
        message.originChainId,
        originToken.addressOrDenom,
      ),
      destinationToken: getBlockExplorerAddressUrl(
        chainMetadataResolver,
        message.destinationChainId,
        destinationToken.addressOrDenom,
      ),
      transferRecipient: getBlockExplorerAddressUrl(
        chainMetadataResolver,
        message.destinationChainId,
        transferRecipient,
      ),
    };
  }, [chainMetadataResolver, message.destinationChainId, message.originChainId, warpRouteDetails]);

  if (!warpRouteDetails) return null;

  const { amount, transferRecipient, originToken, destinationToken } = warpRouteDetails;
  const isCollateral = isCollateralRoute(destinationToken.standard);

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
        {warpRouteDetails.originToken.logoURI && (
          <div className="flex flex-shrink-0 items-center justify-center">
            <TokenIcon token={warpRouteDetails.originToken} size={80} />
          </div>
        )}
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
              labelWidth="w-28 sm:w-32"
              display={`${amount} ${originToken.symbol}`}
              blurValue={blur}
              showCopy
            />
            <KeyValueRow
              label="Origin token:"
              labelWidth="w-28 sm:w-32"
              display={originToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls.originToken}
              showCopy
            />
            <KeyValueRow
              label="Destination token:"
              labelWidth="w-28 sm:w-32"
              display={destinationToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls.destinationToken}
              showCopy
            />
            <KeyValueRow
              label="Transfer recipient:"
              labelWidth="w-28 sm:w-32"
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
