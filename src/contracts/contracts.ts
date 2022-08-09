import { RouterContracts, RouterFactories } from '@abacus-network/sdk';

import { AbcERC721, AbcERC721__factory } from '../types';

export type AbcERC721Factories = RouterFactories<AbcERC721>;

export const abcERC721Factories: AbcERC721Factories = {
  router: new AbcERC721__factory(),
};

export type AbcERC721Contracts = RouterContracts<AbcERC721>;
