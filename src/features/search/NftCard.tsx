import { useState } from 'react';

import { IconButton } from '../../components/buttons/IconButton';
import chevronLeft from '../../images/icons/chevron-compact-left.svg';
import chevronRight from '../../images/icons/chevron-compact-right.svg';
import { Nft } from '../../nftTypes';
import { shortenAddress } from '../../utils/addresses';
import { getChainName } from '../../utils/chains';
import { toTitleCase } from '../../utils/string';

export function NftCard({ nft }: { nft: Nft }) {
  const chainName = toTitleCase(getChainName(nft.chainId));
  const contract = shortenAddress(nft.contract);
  return (
    <div className="flex flex-col items-center p-2 bg-gray-50 rounded-md drop-shadow">
      <div className="text-sm">{`Token #${nft.tokenId}`}</div>
      <div className="text-xs mt-2">{chainName}</div>
      <div className="text-xs mt-2">{contract}</div>
    </div>
  );
}

export function NftCardCarousel({ nfts }: { nfts: Nft[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.floor((nfts.length - 1) / 4); // 0 indexed
  const currentPageNfts = nfts.slice(page * 4, page * 4 + 4);
  return (
    <div className="relative w-full">
      <div className="flex items-center justify-center space-x-3 py-1 overflow-visible ">
        {currentPageNfts.map((nft, i) => (
          <NftCard key={`nftCard-${i}`} nft={nft} />
        ))}
      </div>
      {page > 0 && (
        <div className="absolute -left-4 top-1/3 opacity-80">
          <IconButton
            imgSrc={chevronLeft}
            title="Back"
            onClick={() => setPage(page - 1)}
            width={30}
            height={40}
          />
        </div>
      )}
      {page < totalPages && (
        <div className="absolute -right-4 top-1/3 opacity-80">
          <IconButton
            imgSrc={chevronRight}
            title="More"
            onClick={() => setPage(page + 1)}
            width={30}
            height={40}
          />
        </div>
      )}
    </div>
  );
}
