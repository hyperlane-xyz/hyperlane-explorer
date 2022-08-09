import { useConnectModal } from '@rainbow-me/rainbowkit';
import Image from 'next/future/image';
import useDropdownMenu from 'react-accessible-dropdown-menu-hook';
import { toast } from 'react-toastify';
import { useAccount, useDisconnect, useNetwork, useSwitchNetwork } from 'wagmi';

import { Identicon } from '../../components/icons/Identicon';
import ChevronDown from '../../images/icons/chevron-down.svg';
import Clipboard from '../../images/icons/clipboard-plus.svg';
import Cube from '../../images/icons/cube.svg';
import Wallet from '../../images/icons/wallet.svg';
import XCircle from '../../images/icons/x-circle.svg';
import { shortenAddress } from '../../utils/addresses';
import { tryClipboardSet } from '../../utils/clipboard';
import { logger } from '../../utils/logger';
import { useIsSsr } from '../../utils/ssr';

export function WalletControlBar() {
  const isSsr = useIsSsr();
  if (isSsr) {
    // https://github.com/wagmi-dev/wagmi/issues/542#issuecomment-1144178142
    return null;
  }

  return (
    <div className="flex justify-center items-stretch bg-white shadow-md rounded-md opacity-90">
      <AccountDropdown />
      <div className="w-0.5 bg-gray-300" />
      <ChainDropdown />
    </div>
  );
}

function AccountDropdown() {
  const { address, isConnected, connector } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnectAsync } = useDisconnect();

  const isAccountReady = !!(address && isConnected && connector);

  const { buttonProps, itemProps, isOpen, setIsOpen } = useDropdownMenu(2);

  const onClickDisconnect = async () => {
    setIsOpen(false);
    try {
      if (!disconnectAsync) throw new Error('Disconnect function is null');
      await disconnectAsync();
    } catch (error) {
      logger.error('Error disconnecting to wallet', error);
      toast.error('Could not disconnect wallet');
    }
  };

  const onClickCopy = async () => {
    setIsOpen(false);
    if (!address) return;
    await tryClipboardSet(address);
  };

  return (
    <div className="relative">
      {isAccountReady ? (
        <button className={styles.dropdownButton} {...buttonProps}>
          <Identicon address={address} size={30} />
          <div className="flex flex-col mx-3 items-start">
            <div className="text-xs">{connector.name}</div>
            <div className="text-xs">{shortenAddress(address, true)}</div>
          </div>
          <Icon src={ChevronDown} alt="Down Arrow" size={14} />
        </button>
      ) : (
        <button className={styles.dropdownButton} onClick={openConnectModal}>
          <Icon src={Wallet} alt="Wallet" />
          <div className="ml-2.5">Connect</div>
        </button>
      )}

      <div
        className={`${styles.dropdownContainer} ${!isOpen && 'hidden'}`}
        role="menu"
      >
        <a
          {...itemProps[0]}
          className={styles.dropdownOption}
          onClick={onClickCopy}
        >
          <Icon src={Clipboard} alt="Copy" />
          <div className="ml-2">Copy Address</div>
        </a>
        <a
          {...itemProps[1]}
          className={styles.dropdownOption}
          onClick={onClickDisconnect}
        >
          <Icon src={XCircle} alt="Logout" />
          <div className="ml-2">Disconnect</div>
        </a>
      </div>
    </div>
  );
}

function ChainDropdown() {
  const { chain } = useNetwork();
  const { chains, switchNetworkAsync } = useSwitchNetwork();

  const { buttonProps, itemProps, isOpen, setIsOpen } = useDropdownMenu(
    chains.length,
  );

  const onClickChain = async (targetChainId: number) => {
    setIsOpen(false);
    try {
      if (!switchNetworkAsync) throw new Error('Switch function is null');
      await switchNetworkAsync(targetChainId);
    } catch (error) {
      logger.error('Error switching network', error);
      toast.error('Could not switch network');
    }
  };

  return (
    <div className="relative">
      <button className={styles.dropdownButton} {...buttonProps}>
        <Icon src={Cube} alt="Network" size={16} />
        <div className="mx-2">{chain?.name || 'None'}</div>
        <Icon src={ChevronDown} alt="Down Arrow" size={14} />
      </button>

      <div
        className={`${styles.dropdownContainer} ${!isOpen && 'hidden'} right-0`}
        role="menu"
      >
        {chains.map((c, i) => (
          <a
            key={c.name + i}
            {...itemProps[0]}
            className={styles.dropdownOption}
            onClick={() => onClickChain(c.id)}
          >
            <div>{c.name}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function Icon({ src, alt, size }: { src: any; alt: string; size?: number }) {
  return (
    <div className="flex items-center">
      <Image src={src} alt={alt} width={size ?? 18} height={size ?? 18} />
    </div>
  );
}

const styles = {
  dropdownButton:
    'h-full flex items-center px-3 py-2.5 rounded-md text-black hover:bg-gray-100 active:bg-gray-200 transition-all duration-300',
  dropdownContainer: 'dropdown-menu w-44 mt-2 mr-px bg-white',
  dropdownOption:
    'flex items-center cursor-pointer p-2 mt-1 rounded hover:bg-gray-100',
};
