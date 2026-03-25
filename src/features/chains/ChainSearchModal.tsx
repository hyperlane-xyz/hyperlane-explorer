import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { ChainSearchMenu, Modal } from '@hyperlane-xyz/widgets';

import { useChainMetadataResolver, useStore } from '../../metadataStore';

import { useScrapedChains } from './queries/useScrapedChains';

export function ChainSearchModal({
  isOpen,
  close,
  onClickChain,
  showAddChainMenu,
}: {
  isOpen: boolean;
  close: () => void;
  onClickChain?: (metadata: ChainMetadata) => void;
  showAddChainMenu?: boolean;
}) {
  const chainMetadataResolver = useChainMetadataResolver();
  const { chains } = useScrapedChains(chainMetadataResolver);
  const { chainMetadataOverrides, setChainMetadataOverrides } = useStore((s) => ({
    chainMetadataOverrides: s.chainMetadataOverrides,
    setChainMetadataOverrides: s.setChainMetadataOverrides,
  }));

  const onClick = onClickChain || (() => {});

  return (
    <Modal isOpen={isOpen} close={close} panelClassname="p-4 sm:p-5 max-w-lg min-h-[40vh]">
      <ChainSearchMenu
        chainMetadata={chains}
        onClickChain={onClick}
        overrideChainMetadata={chainMetadataOverrides}
        onChangeOverrideMetadata={setChainMetadataOverrides}
        showAddChainButton={true}
        showAddChainMenu={showAddChainMenu}
      />
    </Modal>
  );
}
