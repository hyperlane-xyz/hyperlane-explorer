import {
  AbacusCore,
  AbacusRouterDeployer,
  ChainMap,
  ChainName,
  MultiProvider,
} from '@abacus-network/sdk';

import { AbcERC721Config } from '../consts/networksConfig';

import {
  AbcERC721Contracts,
  AbcERC721Factories,
  abcERC721Factories,
} from './contracts';

export class AbcERC721Deployer<
  Chain extends ChainName,
> extends AbacusRouterDeployer<
  Chain,
  AbcERC721Contracts,
  AbcERC721Config,
  AbcERC721Factories
> {
  constructor(
    multiProvider: MultiProvider<Chain>,
    configMap: ChainMap<Chain, AbcERC721Config>,
    protected core: AbacusCore<Chain>,
  ) {
    super(multiProvider, configMap, abcERC721Factories, {});
  }

  // Custom contract deployment logic can go here
  // If no custom logic is needed, call deployContract for the router
  async deployContracts(chain: Chain, config: AbcERC721Config) {
    const router = await this.deployContract(chain, 'router', [
      config.abacusConnectionManager,
      config.interchainGasPaymaster,
    ]);
    return {
      router,
    };
  }
}
