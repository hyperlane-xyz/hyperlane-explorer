import { Tooltip } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { TokenIcon } from '../../../components/icons/TokenIcon';
import { Card } from '../../../components/layout/Card';
import SendMoney from '../../../images/icons/send-money.svg';
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
    <Card className="w-full space-y-4">
      <div className="flex items-center justify-between">
        {warpRouteDetails.originToken.logoURI ? (
          <TokenIcon token={warpRouteDetails.originToken} size={28} />
        ) : (
          <Image src={SendMoney} width={28} height={28} alt="" />
        )}
        <div className="flex items-center pb-1">
          <h3 className="mr-2 text-md font-medium text-primary-500">Warp Transfer Details</h3>
          <Tooltip
            id="warp-route-info"
            content="Information about the warp route transfer such as the end recipient and amount transferred"
          />
        </div>
      </div>
      {isCollateral && (
        <div className="rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-700">
          <span className="font-medium">Collateral-backed route:</span> This transfer uses locked
          collateral on the destination chain
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <KeyValueRow
          label="Amount:"
          labelWidth="w-20 sm:w-32"
          display={`${amount} ${originToken.symbol}`}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          showCopy
        />
        <KeyValueRow
          label="Origin token:"
          labelWidth="w-20 sm:w-32"
          display={originToken.addressOrDenom}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.originToken}
          showCopy
        />
        <KeyValueRow
          label="Destination token:"
          labelWidth="w-20 sm:w-32"
          display={destinationToken.addressOrDenom}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.destinationToken}
          showCopy
        />
        <KeyValueRow
          label="Transfer recipient:"
          labelWidth="w-20 sm:w-32"
          display={transferRecipient}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.transferRecipient}
          showCopy
        />
      </div>
    </Card>
  );
}
