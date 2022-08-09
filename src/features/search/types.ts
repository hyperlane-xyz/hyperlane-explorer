import { Nft } from '../../nftTypes';

export interface SearchFormValues {
  contract: Address;
}

export type ChainToContractToNft = Record<
  number,
  Record<Address, Record<number, Nft>>
>;
