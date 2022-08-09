import { Signer } from 'ethers';

import { AbcERC721__factory } from '../../types';
import { logger } from '../../utils/logger';

import { TransferFormValues } from './types';
import { deserializeNft } from './utils';

export async function transferNft(params: TransferFormValues, signer: Signer) {
  const { nftId, recipient, chainId } = params;
  const destinationChainId = parseInt(chainId);
  logger.debug(
    `Attempting to transfer ${nftId} to ${recipient} on ${destinationChainId}`,
  );

  const nft = deserializeNft(nftId);
  const originChainId = nft.chainId;

  logger.debug('Creating AbcErc721 contract for chain:', originChainId);
  const contract = AbcERC721__factory.connect(nft.contract, signer);

  if (originChainId === destinationChainId) {
    const sender = await signer.getAddress();
    await contract['safeTransferFrom(address,address,uint256)'](
      sender,
      recipient,
      nft.tokenId,
    );
  } else {
    // TODO get domain id and call
    // await contract.transferRemote(domainId, recipient, nft.tokenId)
  }
}
