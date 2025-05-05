import { Tooltip } from '@hyperlane-xyz/widgets';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../../../components/layout/Card';
import SendMoney from '../../../images/icons/send-money.svg';
import { useMultiProvider, useStore } from '../../../store';
import { Message } from '../../../types';
import { tryGetBlockExplorerAddressUrl } from '../../../utils/url';
import { parseWarpRouteMessageDetails } from '../utils';
import { KeyValueRow } from './KeyValueRow';
import { BlockExplorerAddressUrls } from './types';

interface Props {
  message: Message;
  blur: boolean;
}

export function WarpTransferDetailsCard({ message, blur }: Props) {
  const multiProvider = useMultiProvider();
  const { warpRouteChainAddressMap } = useStore((s) => ({
    warpRouteChainAddressMap: s.warpRouteChainAddressMap,
  }));
  const warpRouteDetails = useMemo(
    () => parseWarpRouteMessageDetails(message, warpRouteChainAddressMap, multiProvider),
    [message, warpRouteChainAddressMap, multiProvider],
  );
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
      warpRouteDetails.originTokenAddress,
    );
    const destinationToken = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.destinationChainId,
      warpRouteDetails.destinationTokenAddress,
    );
    const transferRecipient = await tryGetBlockExplorerAddressUrl(
      multiProvider,
      message.destinationChainId,
      warpRouteDetails.transferRecipient,
    );
    return { destinationToken, originToken, transferRecipient };
  }, [message, multiProvider, warpRouteDetails]);

  useEffect(() => {
    getBlockExplorerLinks()
      .then((urls) => setBlockExplorerAddressUrls(urls))
      .catch(() => setBlockExplorerAddressUrls(undefined));
  }, [getBlockExplorerLinks]);

  if (!warpRouteDetails) return null;

  const {
    amount,
    destinationTokenAddress,
    transferRecipient,
    originTokenAddress,
    originTokenSymbol,
  } = warpRouteDetails;

  return (
    <Card className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Image src={SendMoney} width={28} height={28} alt="" className="opacity-80" />
        <div className="flex items-center pb-1">
          <h3 className="mr-2 text-md font-medium text-blue-500">Warp Transfer Details</h3>
          <Tooltip
            id="warp-route-info"
            content="Information about the warp route transfer such as the end recipient and amount transferred"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <KeyValueRow
          label="Amount:"
          labelWidth="w-20 sm:w-32"
          display={`${amount} ${originTokenSymbol}`}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          showCopy
        />
        <KeyValueRow
          label="Origin token:"
          labelWidth="w-20 sm:w-32"
          display={originTokenAddress}
          displayWidth="w-64 sm:w-96"
          blurValue={blur}
          link={blockExplorerAddressUrls?.originToken}
          showCopy
        />
        <KeyValueRow
          label="Destination token:"
          labelWidth="w-20 sm:w-32"
          display={destinationTokenAddress}
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
