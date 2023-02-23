import { mainnetChainsMetadata, testnetChainsMetadata } from '@hyperlane-xyz/sdk';
import { ChainLogo } from '@hyperlane-xyz/widgets';

import { BorderedButton } from '../../components/buttons/BorderedButton';
import { Card } from '../../components/layout/Card';
import { links } from '../../consts/links';
import { getChainDisplayName } from '../../utils/chains';

export function ConfigureChains() {
  return (
    <Card>
      <h2 className="mt-1 text-xl text-blue-500">Chain Settings</h2>
      <p className="mt-3">
        Hyperlane can be deployed to any chain using{' '}
        <a
          href={`${links.docs}/docs/deploy/permissionless-interoperability`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 text-blue-500 hover:text-blue-400"
        >
          Permissionless Interoperability (PI)
        </a>
        . This explorer can be configured to search for messages on any PI chain.
      </p>
      <h3 className="mt-4 text-lg text-blue-500">Default Chains</h3>
      <div className="mt-4 flex">
        <h4 className="text-gray-600">Mainnets:</h4>
        <div className="ml-3 flex gap-3.5 flex-wrap">
          {mainnetChainsMetadata.map((c) => (
            <div className="shrink-0 text-sm flex items-center" key={c.name}>
              <ChainLogo chainId={c.chainId} size={15} color={true} background={false} />
              <span className="ml-1.5">{getChainDisplayName(c.chainId, true)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex">
        <h4 className="text-gray-600">Testnets:</h4>
        <div className="ml-3 flex gap-3.5 flex-wrap">
          {testnetChainsMetadata.map((c) => (
            <div className="shrink-0 text-sm flex items-center" key={c.name}>
              <ChainLogo chainId={c.chainId} size={15} color={true} background={false} />
              <span className="ml-1.5">{getChainDisplayName(c.chainId, true)}</span>
            </div>
          ))}
        </div>
      </div>
      <h3 className="mt-4 text-lg text-blue-500">Custom Chains</h3>
      <BorderedButton classes="mt-4 mb-2 w-full">Add custom chain</BorderedButton>
    </Card>
  );
}
