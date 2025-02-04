import Image from 'next/image';

import { Tooltip } from '@hyperlane-xyz/widgets';

import { Card } from '../../../components/layout/Card';
import SendMoney from '../../../images/icons/send-money.svg';
import { Message } from '../../../types';

import { useStore } from '../../../store';
import { parseWarpRouteDetails } from '../queries/parse';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  blur: boolean;
}

export function WarpTransferDetailCard({ message, blur }: Props) {
  const { warpRouteMap } = useStore((s) => ({
    warpRouteMap: s.warpRouteMap,
  }));
  const warpRouteDetails = parseWarpRouteDetails(message, warpRouteMap);

  if (!warpRouteDetails) return null;

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
          label="Origin token:"
          labelWidth="w-20 sm:w-32"
          display={warpRouteDetails.originTokenAddress}
          displayWidth="w-64 sm:w-80"
          showCopy={true}
          blurValue={blur}
        />
        <KeyValueRow
          label="Symbol:"
          labelWidth="w-20"
          display={warpRouteDetails.originTokenSymbol}
          displayWidth="w-64 sm:w-48"
          blurValue={blur}
        />
        <KeyValueRow
          label="Destination token:"
          labelWidth="w-20 sm:w-32"
          display={warpRouteDetails.destinationTokenAddress}
          displayWidth="w-64 sm:w-80"
          showCopy={true}
          blurValue={blur}
        />
        <KeyValueRow
          label="Symbol:"
          labelWidth="w-20"
          display={warpRouteDetails.destinationTokenSymbol}
          displayWidth="w-64 sm:w-48"
          blurValue={blur}
        />
        <KeyValueRow
          label="Amount:"
          labelWidth="w-20 sm:w-32"
          display={warpRouteDetails.amount}
          displayWidth="w-64 sm:w-80"
          blurValue={blur}
          showCopy
        />
        <KeyValueRow
          label="Fee paid:"
          labelWidth="w-20"
          display={warpRouteDetails.totalPayment}
          displayWidth="w-64 sm:w-48"
          blurValue={blur}
        />
        <KeyValueRow
          label="End recipient:"
          labelWidth="w-20 sm:w-32"
          display={warpRouteDetails.endRecipient}
          displayWidth="w-64 sm:w-80"
          blurValue={blur}
          showCopy
        />
      </div>
    </Card>
  );
}
