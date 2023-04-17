import { ChangeEventHandler, useState } from 'react';

import { ChainName, mainnetChainsMetadata, testnetChainsMetadata } from '@hyperlane-xyz/sdk';

import { CopyButton } from '../../components/buttons/CopyButton';
import { SolidButton } from '../../components/buttons/SolidButton';
import { XIconButton } from '../../components/buttons/XIconButton';
import { ChainLogo } from '../../components/icons/ChainLogo';
import { Card } from '../../components/layout/Card';
import { Modal } from '../../components/layout/Modal';
import { links } from '../../consts/links';
import { useMultiProvider } from '../../multiProvider';

import { tryParseChainConfig } from './chainConfig';
import { useChainConfigs } from './useChainConfigs';
import { getChainDisplayName } from './utils';

export function ConfigureChains() {
  const { chainConfigs, setChainConfigs } = useChainConfigs();
  const multiProvider = useMultiProvider();

  const [showAddChainModal, setShowAddChainModal] = useState(false);

  const [customChainInput, setCustomChainInput] = useState('');
  const onCustomChainInputChange: ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    setCustomChainInput(e?.target?.value || '');
  };
  const [chainInputErr, setChainInputErr] = useState('');

  const closeModal = () => {
    setShowAddChainModal(false);
    setChainInputErr('');
  };

  const onClickAddChain = () => {
    setChainInputErr('');
    const result = tryParseChainConfig(customChainInput, multiProvider);
    if (result.success) {
      setChainConfigs({
        ...chainConfigs,
        [result.chainConfig.name]: result.chainConfig,
      });
      setCustomChainInput('');
      setShowAddChainModal(false);
    } else {
      setChainInputErr(`Invalid config: ${result.error}`);
    }
  };

  const onClickRemoveChain = (chainName: ChainName) => {
    const newChainConfigs = { ...chainConfigs };
    delete newChainConfigs[chainName];
    setChainConfigs({
      ...newChainConfigs,
    });
  };

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
              <span className="ml-1.5">{getChainDisplayName(multiProvider, c.chainId, true)}</span>
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
              <div className="ml-1.5">{getChainDisplayName(multiProvider, c.chainId, true)}</div>
            </div>
          ))}
        </div>
      </div>
      <h3 className="mt-4 text-lg text-blue-500">Custom Chains</h3>
      <table className="mt-4 w-full">
        <thead>
          <tr>
            <th className={styles.header}>Chain</th>
            <th className={styles.header}>Chain ID</th>
            <th className={styles.header}>Domain ID</th>
            <th className={styles.header}>Name</th>
            <th className={`${styles.header} hidden sm:table-cell`}>RPC URL</th>
            <th className={`${styles.header} hidden md:table-cell`}>Explorer</th>
            <th className={styles.header}></th>
          </tr>
        </thead>
        <tbody>
          {Object.values(chainConfigs).map((chain) => (
            <tr key={`chain-${chain.chainId}`}>
              <td>
                <ChainLogo chainId={chain.chainId} size={32} color={true} background={true} />
              </td>
              <td className={styles.value}>{chain.chainId}</td>
              <td className={styles.value}>{chain.domainId || chain.chainId}</td>
              <td className={styles.value}>{chain.displayName || chain.name}</td>
              <td className={styles.value + ' hidden sm:table-cell'}>
                {chain.publicRpcUrls?.[0]?.http || 'Unknown'}
              </td>
              <td className={styles.value + ' hidden md:table-cell'}>
                {chain.blockExplorers?.[0]?.url || 'Unknown'}
              </td>
              <td>
                <XIconButton
                  onClick={() => onClickRemoveChain(chain.name)}
                  title="Remove"
                  size={22}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SolidButton classes="mt-4 mb-2 py-0.5 w-full" onClick={() => setShowAddChainModal(true)}>
        Add custom chain
      </SolidButton>
      <Modal
        isOpen={showAddChainModal}
        close={closeModal}
        title="Add Custom Chain"
        maxWidth="max-w-xl"
      >
        <p className="mt-2">
          Input a chain metadata config including core contract addresses to enable exploration of
          that chain. See{' '}
          <a
            href={`${links.docs}/docs/build-with-hyperlane/explorer/configuring-pi-chains`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-blue-500 hover:text-blue-400"
          >
            PI Explorer documentation
          </a>{' '}
          for examples.
        </p>
        <div className="relative mt-4">
          <textarea
            className="w-full min-h-[20rem] p-2 border border-gray-400 rounded text-sm focus:outline-none"
            placeholder={customChainTextareaPlaceholder}
            value={customChainInput}
            onChange={onCustomChainInputChange}
          ></textarea>
          <CopyButton
            copyValue={customChainInput || customChainTextareaPlaceholder}
            width={16}
            height={16}
            classes="absolute top-2 right-2"
          />
        </div>
        {chainInputErr && <div className="mt-2 text-red-600 text-sm">{chainInputErr}</div>}
        <SolidButton classes="mt-2 mb-2 py-0.5 w-full" onClick={onClickAddChain}>
          Add
        </SolidButton>
      </Modal>
    </Card>
  );
}

const customChainTextareaPlaceholder = `{
  "chainId": 5,
  "name": "goerli",
  "publicRpcUrls": [{ "http": "https://foobar.com" }],
  "blockExplorers": [ {
      "name": "GoerliScan",
      "url": "https://goerli.etherscan.io",
      "apiUrl": "https://api-goerli.etherscan.io/api",
      "apiKey": "12345"
  } ],
  "blocks": { "confirmations": 1, "estimateBlockTime": 13 },
  "contracts": {
    "mailbox": "0x123...",
    "multisigIsm": "0x123...",
    "interchainGasPaymaster": "0x123..."
  }
}
`;

const styles = {
  header: 'text-sm text-gray-700 font-normal pt-2 pb-1 text-left',
  value: 'py-4 text-sm px-1',
  valueTruncated: 'py-4 text-sm truncate',
};
