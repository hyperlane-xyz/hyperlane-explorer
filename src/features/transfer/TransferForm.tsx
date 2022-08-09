import { Form, Formik } from 'formik';
import { useRouter } from 'next/router';
import { useNetwork } from 'wagmi';

import { ConnectAwareSubmitButton } from '../../components/buttons/ConnectAwareSubmitButton';
import { SelectField } from '../../components/input/SelectField';
import { TextField } from '../../components/input/TextField';
import { isValidAddress, shortenAddress } from '../../utils/addresses';
import { getChainName } from '../../utils/chains';
import { useSavedNfts } from '../search/useSavedNfts';

import { TransferFormValues } from './types';
import { serializeNft } from './utils';

const initialValues: TransferFormValues = {
  nftId: '',
  recipient: '',
  chainId: '',
};

export function TransferForm() {
  const router = useRouter();
  const { chains } = useNetwork();
  const { nfts } = useSavedNfts();

  const nftOptions = nfts.map((n) => ({
    value: serializeNft(n),
    display: `${getChainName(n.chainId)} - ${shortenAddress(n.contract)} - #${
      n.tokenId
    }`,
  }));

  const chainOptions = chains.map((c) => ({
    value: c.id.toString(),
    display: getChainName(c.id),
  }));

  const onSubmit = async (values: TransferFormValues) => {
    await router.push({ pathname: '/transfer/review', query: { ...values } });
  };

  const validateForm = ({ nftId, chainId, recipient }: TransferFormValues) => {
    if (!nftId) {
      return { nftId: 'Nft required' };
    }
    if (!chainId) {
      return { chainId: 'Chain required' };
    }
    if (!isValidAddress(recipient)) {
      return { recipient: 'Invalid Address' };
    }
    return {};
  };

  return (
    <Formik<TransferFormValues>
      initialValues={initialValues}
      onSubmit={onSubmit}
      validate={validateForm}
      validateOnChange={false}
      validateOnBlur={false}
    >
      <Form className="flex flex-col justify-center items-center w-full">
        <label htmlFor="recipient" className="text-gray-700 mt-1">
          Source NFT
        </label>
        <SelectField
          options={nftOptions}
          name="nftId"
          placeholder="Select NFT"
        />
        <label htmlFor="recipient" className="mt-3 text-gray-700">
          Recipient Address
        </label>
        <TextField name="recipient" placeholder="0x123..." />
        <label htmlFor="contract" className="mt-3 text-gray-700">
          Destination Chain
        </label>
        <SelectField
          options={chainOptions}
          name="chainId"
          placeholder="Select chain"
        />
        <div className="flex justify-center mt-5 mb-1">
          <ConnectAwareSubmitButton connectText="Continue" />
        </div>
      </Form>
    </Formik>
  );
}
