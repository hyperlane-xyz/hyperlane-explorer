import type { TokenArgs } from '@hyperlane-xyz/sdk';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { useMemo } from 'react';

import { TokenIcon } from '../../../components/icons/TokenIcon';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../../metadataStore';
import { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { formatAmountWithCommas } from '../../../utils/amount';
import { getBlockExplorerAddressUrl } from '../../../utils/url';
import { isCollateralRoute } from '../collateral/utils';
import { useWarpFees } from '../warpFees/useWarpFees';
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

  const warpFees = useWarpFees(message, warpRouteDetails);

  if (!warpRouteDetails) return null;

  const { amount, destAmount, transferRecipient, originToken, destinationToken } = warpRouteDetails;
  const isCollateral = isCollateralRoute(destinationToken.standard);
  const isDifferentToken =
    originToken.symbol !== destinationToken.symbol ||
    originToken.logoURI !== destinationToken.logoURI;
  const receivedAmount = destAmount ?? amount;
  const labelWidth = 'w-28 sm:w-32';

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
          <div className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 sm:gap-x-2">
            <KeyValueRow
              label="Amount:"
              labelWidth={labelWidth}
              display={`${formatAmountWithCommas(amount)} ${originToken.symbol}`}
              copyValue={amount}
              blurValue={blur}
              showCopy
            />
            <KeyValueRow
              label="Received amount:"
              labelWidth={labelWidth}
              display={`${formatAmountWithCommas(receivedAmount)} ${destinationToken.symbol}`}
              copyValue={receivedAmount}
              blurValue={blur}
              showCopy
            />
            <KeyValueRow
              label="Origin token:"
              labelWidth={labelWidth}
              display={originToken.symbol}
              tooltip={originToken.addressOrDenom}
              copyValue={originToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls.originToken}
              showCopy
            />
            <KeyValueRow
              label="Destination token:"
              labelWidth={labelWidth}
              display={destinationToken.symbol}
              tooltip={destinationToken.addressOrDenom}
              copyValue={destinationToken.addressOrDenom}
              blurValue={blur}
              link={blockExplorerAddressUrls.destinationToken}
              showCopy
            />
            {warpFees && (
              <>
                <KeyValueRow
                  label="Total sent:"
                  labelWidth={labelWidth}
                  display={`${warpFees.totalSent} ${warpFees.tokenSymbol}`}
                  blurValue={blur}
                />
                <KeyValueRow
                  label="Warp fee:"
                  labelWidth={labelWidth}
                  display={`${warpFees.bridgeFee} ${warpFees.tokenSymbol}`}
                  blurValue={blur}
                />
              </>
            )}
            <KeyValueRow
              label="Transfer recipient:"
              labelWidth={labelWidth}
              display={transferRecipient}
              blurValue={blur}
              link={blockExplorerAddressUrls.transferRecipient}
              showCopy
              classes="sm:col-span-2"
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
  if (!isDifferentToken) {
    return (
      <div className="flex flex-shrink-0 items-center justify-center">
        <TokenIcon token={originToken} size={80} />
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
