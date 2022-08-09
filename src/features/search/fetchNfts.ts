import { Provider } from '@wagmi/core';
import { BigNumber, Contract } from 'ethers';

import { TOKEN_FETCH_LIMIT } from '../../consts/consts';
import { Nft } from '../../nftTypes';
import { AbcERC721__factory } from '../../types';
import { logger } from '../../utils/logger';

export async function fetchNfts(
  accountAddr: Address,
  contractAddr: Address,
  provider: Provider,
) {
  const chainId = provider.network.chainId;
  logger.debug('Creating AbcErc721 contract for chain:', chainId);
  const contract = AbcERC721__factory.connect(contractAddr, provider);
  const _numOwned = await contract.balanceOf(accountAddr);
  const numOwned = BigNumber.from(_numOwned).toNumber();
  if (!numOwned || numOwned <= 0) {
    logger.debug('No NFTs found');
    return [];
  }
  if (numOwned > TOKEN_FETCH_LIMIT) {
    logger.warn('NFT count exceeds limit');
    return [];
  }

  const nfts: Nft[] = [];
  for (let i = 0; i < numOwned; i++) {
    const nft = await fetchNftDetails(contract, i, accountAddr, chainId);
    if (nft) nfts.push(nft);
  }
  return nfts;
}

// TODO consider adding caching of nft details as they don't change
async function fetchNftDetails(
  contract: Contract,
  index: number,
  account: Address,
  chainId: number,
): Promise<Nft | null> {
  const _tokenId: BigNumber = await contract.tokenOfOwnerByIndex(
    account,
    index,
  );
  if (!_tokenId || _tokenId.lt(0)) {
    logger.error(
      'Invalid token id from contract:',
      contract.address,
      _tokenId.toString(),
    );
    return null;
  }
  const tokenId = _tokenId.toNumber();

  const fetchedTokenUri = await contract.tokenURI(tokenId);
  if (!fetchedTokenUri) {
    logger.error(
      'Invalid token uri from contract:',
      contract.address,
      fetchedTokenUri,
    );
    return null;
  }
  const tokenUri = fetchedTokenUri.toString();

  // Note: We could fetch the imageUri from the tokenUri here but
  // ipfs is slow so better to not block on that. Instead it
  // will be fetched later

  return {
    chainId,
    contract: contract.address,
    tokenId,
    tokenUri,
  };
}
