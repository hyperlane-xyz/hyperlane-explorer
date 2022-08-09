import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

import { TOKEN_STORAGE_KEY } from '../../consts/consts';
import { Nft } from '../../nftTypes';
import { logger } from '../../utils/logger';

import { ChainToContractToNft } from './types';

export function useSavedNfts() {
  const [nftMap, setNftMap] = useState<ChainToContractToNft>({});

  // Checks localStorage for any saved contracts + token results
  useEffect(() => {
    const savedNfts = getNftsFromStorage();
    setNftMap(savedNfts ?? {});
  }, []);

  const addNft = useCallback(
    (nft: Nft) => {
      const { chainId, contract } = nft;
      const newNfts = { ...nftMap };
      newNfts[chainId] ??= {};
      newNfts[chainId][contract] ??= {};
      newNfts[chainId][contract][nft.tokenId] = nft;
      setNftMap(newNfts);
      setNftsInStorage(newNfts);
    },
    [nftMap, setNftMap],
  );

  const removeNft = useCallback(
    (nft: Nft) => {
      const { chainId, contract } = nft;
      const newNfts = { ...nftMap };
      delete newNfts[chainId][contract][nft.tokenId];
      setNftMap(newNfts);
      setNftsInStorage(newNfts);
    },
    [nftMap, setNftMap],
  );

  const nftList = Object.values(nftMap)
    .flatMap((byContract) => Object.values(byContract))
    .flatMap((byId) => Object.values(byId));

  return { nfts: nftList, addNft, removeNft };
}

function getNftsFromStorage() {
  try {
    if (!localStorage) return;
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!saved) return;
    return JSON.parse(saved) as ChainToContractToNft;
  } catch (error) {
    logger.error('Error fetching nfts from storage', error);
    toast.error('Could not load saved nfts');
    return;
  }
}

function setNftsInStorage(nfts: ChainToContractToNft) {
  try {
    if (!localStorage) return;
    const serialized = JSON.stringify(nfts);
    localStorage.setItem(TOKEN_STORAGE_KEY, serialized);
  } catch (error) {
    logger.error('Error setting nfts in storage', error);
    toast.error('Could not save token');
    return;
  }
}
