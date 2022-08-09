import { providers } from 'ethers';

import {
  AbacusCore,
  ChainMap,
  ChainName,
  buildContracts,
  getChainToOwnerMap,
  getMultiProviderFromConfigAndProvider,
} from '@abacus-network/sdk';

import { prodConfigs } from '../src/consts/networksConfig';
import { AbcERC721App } from '../src/contracts/app';
import { AbcERC721Checker } from '../src/contracts/check';
import {
  AbcERC721Contracts,
  abcERC721Factories,
} from '../src/contracts/contracts';

// COPY FROM OUTPUT OF DEPLOYMENT SCRIPT OR IMPORT FROM ELSEWHERE
const deploymentAddresses = {};

// SET CONTRACT OWNER ADDRESS HERE
const ownerAddress = '0x123...';

async function check() {
  console.info('Getting provider');
  const provider = new providers.JsonRpcProvider('URL_HERE');

  console.info('Preparing utilities');
  const multiProvider = getMultiProviderFromConfigAndProvider(
    prodConfigs,
    provider,
  );
  const contractsMap = buildContracts(
    deploymentAddresses,
    abcERC721Factories,
  ) as ChainMap<ChainName, AbcERC721Contracts>;
  const app = new AbcERC721App(contractsMap, multiProvider);

  const core = AbacusCore.fromEnvironment('mainnet', multiProvider);
  const config = core.extendWithConnectionClientConfig(
    getChainToOwnerMap(prodConfigs, ownerAddress),
  );

  console.info('Starting check');
  const abcERC721Checker = new AbcERC721Checker(multiProvider, app, config);
  await abcERC721Checker.check();
  abcERC721Checker.expectEmpty();
}

check()
  .then(() => console.info('Check complete'))
  .catch(console.error);
