import { Nft } from '../../nftTypes';

export function serializeNft(nft: Nft): string {
  return `${nft.chainId}:${nft.contract}:${nft.tokenId}`;
}

export function deserializeNft(nftId: string): Nft {
  const [chainId, contract, tokenId] = nftId.split(':');
  return {
    chainId: parseInt(chainId),
    contract,
    tokenId: parseInt(tokenId),
  };
}
