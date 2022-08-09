import { Form, Formik } from 'formik';
import { toast } from 'react-toastify';
import { useAccount, useProvider } from 'wagmi';

import { ConnectAwareSubmitButton } from '../../components/buttons/ConnectAwareSubmitButton';
import { TextField } from '../../components/input/TextField';
import { HrDivider } from '../../components/layout/HrDivider';
import { isValidAddress } from '../../utils/addresses';
import { logger } from '../../utils/logger';

import { NftCardCarousel } from './NftCard';
import { fetchNfts } from './fetchNfts';
import { SearchFormValues } from './types';
import { useSavedNfts } from './useSavedNfts';

const initialValues: SearchFormValues = {
  contract: '',
};

export function SearchForm() {
  // TODO consider using multiprovider here?
  const { address } = useAccount();
  const provider = useProvider();
  const { nfts, addNft } = useSavedNfts();

  const onSubmit = async ({ contract }: SearchFormValues) => {
    if (!address || !provider) return;
    try {
      const newNfts = await fetchNfts(address, contract, provider);
      if (!nfts?.length) return;
      for (const nft of newNfts) {
        addNft(nft);
      }
    } catch (error) {
      logger.error(`Error searching for NFTs in contract ${contract}`, error);
      toast.error('Error finding NFTs');
    }
  };

  const validateForm = ({ contract }: SearchFormValues) => {
    if (!isValidAddress(contract)) {
      return { contract: 'Invalid Address' };
    }
    return {};
  };

  return (
    <>
      <Formik<SearchFormValues>
        initialValues={initialValues}
        onSubmit={onSubmit}
        validate={validateForm}
        validateOnChange={false}
        validateOnBlur={false}
      >
        <Form className="flex flex-col justify-center items-center w-full">
          <h2 className="text-gray-700">Your Abacus NFTs</h2>
          {nfts.length > 0 ? (
            <NftCardCarousel nfts={nfts} />
          ) : (
            <div className="text-sm text-gray-400 mt-3">
              No NFTs yet, try adding a contract below
            </div>
          )}
          <div className="px-1 w-full">
            <HrDivider classes="my-5" />
          </div>
          <h2 className="text-center text-gray-700 mb-1">
            {`Add NFT (AbcErc721)`}
          </h2>
          <TextField name="contract" placeholder="Contract Address 0x123..." />
          <div className="flex justify-center mt-5 mb-1">
            <ConnectAwareSubmitButton connectText="Search" />
          </div>
        </Form>
      </Formik>
    </>
  );
}
