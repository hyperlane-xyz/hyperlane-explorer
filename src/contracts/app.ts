import { AbacusApp, ChainName } from '@abacus-network/sdk';

import { AbcERC721Contracts } from './contracts';

export class AbcERC721App<
  Chain extends ChainName = ChainName,
> extends AbacusApp<AbcERC721Contracts, Chain> {}
