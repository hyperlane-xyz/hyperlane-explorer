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
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides);
  const setChainMetadataOverrides = useStore((s) => s.setChainMetadataOverrides);

  const handleClickChain = (metadata: ChainMetadata) => {
    if (!onClickChain) return;
    onClickChain(metadata);
    close();
  };

  return (
    <Modal isOpen={isOpen} close={close} panelClassname="p-4 sm:p-5 max-w-lg min-h-[40vh]">
      <ChainSearchMenu
        chainMetadata={chains}
        overrideChainMetadata={chainMetadataOverrides}
        onChangeOverrideMetadata={setChainMetadataOverrides}
        onClickChain={handleClickChain}
        showAddChainButton={true}
        showAddChainMenu={showAddChainMenu}
      />
    </Modal>
  );
}
