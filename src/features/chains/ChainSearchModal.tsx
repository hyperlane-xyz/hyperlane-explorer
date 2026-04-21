import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import { ChainSearchMenu, Modal } from '@hyperlane-xyz/widgets';
import { ChainSortByOption } from '@hyperlane-xyz/widgets/chains/ChainSearchMenu';

import { useChainMetadataMap, useStore } from '../../metadataStore';

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
  const chainMetadata = useChainMetadataMap();
  const chainMetadataOverrides = useStore((s) => s.chainMetadataOverrides);
  const setChainMetadataOverrides = useStore((s) => s.setChainMetadataOverrides);

  const handleClickChain = (metadata: ChainMetadata) => {
    onClickChain?.(metadata);
    close();
  };

  return (
    <Modal isOpen={isOpen} close={close} panelClassname="max-w-4xl overflow-hidden p-4 sm:p-5">
      <ChainSearchMenu
        chainMetadata={chainMetadata}
        overrideChainMetadata={chainMetadataOverrides}
        onChangeOverrideMetadata={setChainMetadataOverrides}
        onClickChain={handleClickChain}
        showAddChainButton={true}
        showAddChainMenu={showAddChainMenu}
        defaultSortField={ChainSortByOption.Name}
      />
    </Modal>
  );
}
