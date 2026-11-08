import type { TokenArgs } from '@hyperlane-xyz/sdk';
import { isValidAddress, ProtocolType } from '@hyperlane-xyz/utils';
import { CopyButton, Tooltip } from '@hyperlane-xyz/widgets';
import { useMemo } from 'react';

import { TokenIcon } from '../../../components/icons/TokenIcon';
import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../../metadataStore';
import {
  MessageStatus,
  type Message,
  type MessageStub,
  type WarpRouteDetails,
} from '../../../types';
import { getBlockExplorerAddressUrl } from '../../../utils/url';
import { isCollateralRoute } from '../collateral/utils';
import { WarpFeeDetails } from './WarpFeeDetails';

interface Props {
  message: Message | MessageStub;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpTransferDetails({ message, warpRouteDetails, blur }: Props) {
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
    const tokenUrl = (domain: number, token: TokenArgs) => {
      const address = token.collateralAddressOrDenom ?? token.addressOrDenom;
      const protocol = chainMetadataResolver.tryGetChainMetadata(domain)?.protocol;
      // Native Cosmos denominations are token identifiers, not explorer account addresses.
      if (
        (protocol === ProtocolType.Cosmos || protocol === ProtocolType.CosmosNative) &&
        !isValidAddress(address, protocol)
      )
        return null;
      return getBlockExplorerAddressUrl(chainMetadataResolver, domain, address);
    };

    return {
      originToken: tokenUrl(message.originDomainId, originToken),
      destinationToken: tokenUrl(message.destinationDomainId, destinationToken),
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

  const { amount, destAmount, transferRecipient, originToken, destinationToken } = warpRouteDetails;
  const isCollateral = isCollateralRoute(destinationToken.standard);
  const receivedAmount = destAmount ?? amount;

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 sm:gap-6">
        <TokenDetails
          label="Origin token"
          token={originToken}
          amount={amount}
          amountLabel="Origin amount"
          link={blockExplorerAddressUrls.originToken}
          blur={blur}
        />
        <TokenDetails
          label="Destination token"
          token={destinationToken}
          amount={receivedAmount}
          amountLabel={
            message.status === MessageStatus.Delivered
              ? 'Received (inferred)'
              : 'Expected destination'
          }
          link={blockExplorerAddressUrls.destinationToken}
          blur={blur}
        />
      </div>
      <div className="grid min-w-0 gap-3 border-t border-gray-200 pt-3 sm:grid-cols-2 sm:gap-6">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Transfer recipient</p>
          <div className="mt-1 flex items-start gap-2">
            {blockExplorerAddressUrls.transferRecipient ? (
              <a
                href={blockExplorerAddressUrls.transferRecipient}
                target="_blank"
                rel="noopener noreferrer"
                title="View recipient on the destination block explorer"
                className={`min-w-0 break-all font-mono text-xs leading-5 text-primary-700 underline decoration-primary-200 underline-offset-4 ${blur ? 'blur-xs' : ''}`}
              >
                {transferRecipient} ↗
              </a>
            ) : (
              <span
                className={`min-w-0 break-all font-mono text-xs leading-5 text-gray-800 ${blur ? 'blur-xs' : ''}`}
              >
                {transferRecipient}
              </span>
            )}
            <CopyButton
              copyValue={transferRecipient}
              aria-label="Copy transfer recipient"
              width={12}
              height={12}
              className="mt-1 shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
            />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Payload amount (raw units)</p>
          <div className="mt-1 flex items-start gap-2">
            <code className={`min-w-0 break-all text-sm text-gray-800 ${blur ? 'blur-xs' : ''}`}>
              {warpRouteDetails.wireAmount}
            </code>
            <CopyButton
              copyValue={warpRouteDetails.wireAmount}
              aria-label="Copy payload amount in raw units"
              width={12}
              height={12}
              className="mt-1 shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
            />
          </div>
          <p className="mt-1 text-xxs leading-relaxed text-gray-500">
            Exact encoded integer, before token decimals or scaling.
          </p>
        </div>
      </div>
      <div className="space-y-1 text-xxs leading-relaxed text-gray-500">
        <p>Warp transfer inferred from the payload and Hyperlane Registry token metadata.</p>
        {isCollateral && (
          <p>
            <span className="font-medium">Collateral-backed route:</span> This transfer uses locked
            collateral on the destination chain.
          </p>
        )}
      </div>
      <WarpFeeDetails message={message} warpRouteDetails={warpRouteDetails} blur={blur} />
    </div>
  );
}

export function WarpTransferDetailsCard(props: Props) {
  if (!props.warpRouteDetails) return null;
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
      <WarpTransferDetails {...props} />
    </SectionCard>
  );
}

function TokenDetails({
  label,
  token,
  amount,
  amountLabel,
  link,
  blur,
}: {
  label: string;
  token: TokenArgs;
  amount: string;
  amountLabel: string;
  link: string | null;
  blur: boolean;
}) {
  const address = token.collateralAddressOrDenom ?? token.addressOrDenom;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white">
        <TokenIcon token={token} size={28} />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-gray-500">{amountLabel}:</span>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              title={address}
              className={`min-w-0 break-all font-medium text-primary-700 underline decoration-primary-200 underline-offset-4 ${blur ? 'blur-xs' : ''}`}
            >
              {token.symbol} ↗
            </a>
          ) : (
            <span
              className={`min-w-0 break-all font-medium text-gray-800 ${blur ? 'blur-xs' : ''}`}
              title={address}
            >
              {token.symbol}
            </span>
          )}
          <CopyButton
            copyValue={address}
            aria-label={`Copy ${label.toLowerCase()} address`}
            width={12}
            height={12}
            className="shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
          />
        </div>
        <div className="mt-1 flex items-start gap-2">
          <span
            className={`min-w-0 break-all font-mono text-lg font-medium leading-6 text-gray-900 ${blur ? 'blur-xs' : ''}`}
          >
            {`${amount} ${token.symbol}`}
          </span>
          <CopyButton
            copyValue={amount}
            aria-label={`Copy ${amountLabel.toLowerCase()}`}
            width={12}
            height={12}
            className="mt-1.5 shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
          />
        </div>
      </div>
    </div>
  );
}
