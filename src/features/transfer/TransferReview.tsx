import { constants } from 'ethers';
import Image from 'next/future/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAccount, useNetwork, useSigner } from 'wagmi';

import { SolidButton } from '../../components/buttons/SolidButton';
import { Identicon } from '../../components/icons/Identicon';
import RightArrow from '../../images/icons/arrow-right-short.svg';
import { shortenAddress } from '../../utils/addresses';
import { getChainName } from '../../utils/chains';
import { logger } from '../../utils/logger';

import { transferNft } from './transferNft';
import { TransferFormValues } from './types';
import { deserializeNft } from './utils';

export function TransferReview() {
  const { address } = useAccount();
  const { chain } = useNetwork();
  const { query, replace } = useRouter();
  const [params, setParams] = useState<TransferFormValues | null>(null);
  const { data: signer, isError, isLoading } = useSigner();

  const nft = deserializeNft(params?.nftId || `0:${constants.AddressZero}:0`);
  const sourceChainId = chain?.id || 0;
  const destinationChainId = parseInt(params?.chainId || '0');
  const senderAddr = address || constants.AddressZero;
  const recipientAddr = params?.recipient || constants.AddressZero;

  useEffect(() => {
    const { chainId, nftId, recipient } = query;
    if (
      !chainId ||
      typeof chainId !== 'string' ||
      !nftId ||
      typeof nftId !== 'string' ||
      !recipient ||
      typeof recipient !== 'string'
    ) {
      replace('/transfer').catch((e) =>
        logger.error('Error routing back to transfer', e),
      );
      return;
    }
    setParams({ chainId, nftId, recipient });
  }, [query, replace, setParams]);

  const onClickSend = async () => {
    if (!params) {
      toast.warn('Transfer parameters not set');
      return;
    }
    if (!signer || isError || isLoading) {
      toast.warn('Signer is not ready');
      return;
    }
    try {
      await transferNft(params, signer);
    } catch (error) {
      logger.error('Error transferring NFT', error);
      toast.error('Could not transfer NFT');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center my-2">
      <h2 className="text-gray-700">Confirm Transfer Details</h2>
      <h3 className="text-lg mt-3">{`Sending NFT #${
        nft.tokenId
      } in ${shortenAddress(nft.contract)}`}</h3>
      <div className="flex items-center justify-center space-x-4 mt-5 mb-7">
        <AddressCard address={senderAddr} chainId={sourceChainId} />
        <Image src={RightArrow} alt="Arrow" width={30} height={30} />
        <AddressCard address={recipientAddr} chainId={destinationChainId} />
      </div>
      <SolidButton size="m" onClick={onClickSend}>
        Send
      </SolidButton>
    </div>
  );
}

function AddressCard({
  address,
  chainId,
}: {
  address: Address;
  chainId: number;
}) {
  return (
    <div className="flex items-center justify-center p-2 bg-gray-50 rounded-md drop-shadow">
      <Identicon address={address} size={40} />
      <div className="flex flex-col ml-3">
        <div className="text-sm">{getChainName(chainId)}</div>
        <div className="text-xs mt-1">{shortenAddress(address)}</div>
      </div>
    </div>
  );
}
