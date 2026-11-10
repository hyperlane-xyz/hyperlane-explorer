import { CopyButton, Tooltip } from '@hyperlane-xyz/widgets';

import { SectionCard } from '../../../components/layout/SectionCard';
import { useChainMetadataResolver } from '../../../metadataStore';
import type { Message, MessageStub, WarpRouteDetails } from '../../../types';
import { getBlockExplorerAddressUrl } from '../../../utils/url';
import { WarpFeeDetails } from './WarpFeeDetails';

interface Props {
  message: Message | MessageStub;
  warpRouteDetails: WarpRouteDetails | undefined;
  blur: boolean;
}

export function WarpTransferDetails({ message, warpRouteDetails, blur }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();

  if (!warpRouteDetails) return null;

  const { transferRecipient, wireAmount } = warpRouteDetails;
  const transferRecipientUrl = getBlockExplorerAddressUrl(
    chainMetadataResolver,
    message.destinationDomainId,
    transferRecipient,
  );

  return (
    <div className="space-y-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-6">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Transfer recipient</p>
          <div className="mt-1 flex items-start gap-2">
            {transferRecipientUrl ? (
              <a
                href={transferRecipientUrl}
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
              {wireAmount}
            </code>
            <CopyButton
              copyValue={wireAmount}
              aria-label="Copy payload amount in raw units"
              width={12}
              height={12}
              className="mt-1 shrink-0 text-gray-500 [&_rect]:stroke-current [&_path]:fill-current"
            />
          </div>
        </div>
      </div>
      <WarpFeeDetails
        message={message}
        warpRouteDetails={warpRouteDetails}
        blur={blur}
        className="border-t border-gray-200 pt-3"
      />
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
