import { Tooltip } from '@hyperlane-xyz/widgets';
import { useCallback, useEffect, useState } from 'react';
import { TokenIcon } from '../../../components/icons/TokenIcon';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useMultiProvider } from '../../../store';
import { Message, WarpRouteDetails } from '../../../types';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';
import { isCollateralRoute } from '../collateral/utils';
import { KeyValueRow } from './KeyValueRow';
import { BlockExplorerAddressUrls } from './types';

interface Props {
  message: Message;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpTransferDetailsCard({ message, warpRouteDetails, blur }: Props) {
  const multiProvider = useMultiProvider();
  const [blockExplorerAddressUrls, setBlockExplorerAddressUrls] = useState<
    BlockExplorerAddressUrls | undefined
  >(undefined);

  const getBlockExplorerLinks = useCallback(async (): Promise<
    BlockExplorerAddressUrls | undefined
  > => {
    if (!warpRouteDetails) return undefined;

    const originToken = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.originChainId,
      warpRouteDetails.originToken.addressOrDenom,
    );
    const destinationToken = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.destinationChainId,
      warpRouteDetails.destinationToken.addressOrDenom,
    );
    const transferRecipient = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.destinationChainId,
      warpRouteDetails.transferRecipient,
    );
    return { originToken, destinationToken, transferRecipient };
  }, [message, multiProvider, warpRouteDetails]);

  useEffect(() => {
    getBlockExplorerLinks()
      .then((urls) => setBlockExplorerAddressUrls(urls))
      .catch(() => setBlockExplorerAddressUrls(undefined));
  }, [getBlockExplorerLinks]);

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
              link={blockExplorerAddressUrls?.originToken}
              showCopy
            />
            <KeyValueRow
              label="Destination token:"
              labelWidth="w-28 sm:w-32"
              display={destinationToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls?.destinationToken}
              showCopy
            />
            <KeyValueRow
              label="Transfer recipient:"
              labelWidth="w-28 sm:w-32"
              display={transferRecipient}
              blurValue={blur}
              link={blockExplorerAddressUrls?.transferRecipient}
              showCopy
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
