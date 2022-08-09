import { AbacusRouterChecker, ChainName } from '@abacus-network/sdk';

import { AbcERC721Config } from '../consts/networksConfig';

import { AbcERC721App } from './app';
import { AbcERC721Contracts } from './contracts';

export class AbcERC721Checker<
  Chain extends ChainName,
> extends AbacusRouterChecker<
  Chain,
  AbcERC721App<Chain>,
  AbcERC721Config,
  AbcERC721Contracts
> {}
