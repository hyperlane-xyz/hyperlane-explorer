import { isZeroishAddress } from '@hyperlane-xyz/utils';
import { BoxArrowIcon, CopyButton } from '@hyperlane-xyz/widgets';

import { useChainMetadataResolver } from '../../../../metadataStore';
import { truncateString } from '../../../../utils/string';
import { getBlockExplorerAddressUrl } from '../../../../utils/url';

interface Props {
  address: string;
  chainName: string;
  startChars?: number;
  endChars?: number;
}

export function AddressInline({ address, chainName, startChars = 8, endChars = 6 }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();
  const isZero = isZeroishAddress(address);
  const link = isZero
    ? null
    : getBlockExplorerAddressUrl(chainMetadataResolver, chainName, address);
  const display = isZero ? 'Unknown' : truncateString(address, startChars, endChars);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-sm text-gray-700">{display}</span>
      {!isZero && <CopyButton copyValue={address} width={12} height={12} className="opacity-60" />}
      {link && (
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={link}
          aria-label="View on block explorer"
        >
          <BoxArrowIcon width={12} height={12} />
        </a>
      )}
    </span>
  );
}
