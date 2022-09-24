import Image from 'next/future/image';
import Link from 'next/link';
import useDropdownMenu from 'react-accessible-dropdown-menu-hook';

import { Environment, allConfigs, config } from '../../consts/appConfig';
import { links } from '../../consts/links';
import BookIcon from '../../images/icons/book.svg';
import BugIcon from '../../images/icons/bug.svg';
import HamburgerIcon from '../../images/icons/hamburger.svg';
import HouseIcon from '../../images/icons/house.svg';
import HubIcon from '../../images/icons/hub.svg';
import InfoIcon from '../../images/icons/info-circle.svg';
import Logo from '../../images/logos/hyperlane-logo.svg';
import Name from '../../images/logos/hyperlane-name.svg';

export function Header({ pathName }: { pathName: string }) {
  const { buttonProps, itemProps, isOpen, setIsOpen } = useDropdownMenu(5);
  const closeDropdown = () => {
    setIsOpen(false);
  };
  const isMainnet = config.environment === Environment.Mainnet;

  return (
    <header className="p-2 sm:py-3 sm:pl-6 sm:pr-10 w-full">
      <div className="flex items-center justify-between">
        <Link href="/">
          <a className="flex items-center">
            <div className="flex items-center scale-90 sm:scale-100">
              <Image src={Logo} width={24} height={28} />
              <Image src={Name} width={124} height={28} alt="Hyperlane" className="ml-2 pt-px" />
              <div className="font-serif text-[1.85rem] text-blue-500 ml-2">Explorer</div>
            </div>
          </a>
        </Link>
        <div className="hidden sm:flex sm:space-x-8 sm:items-center md:space-x-10">
          <Link href="/">
            <a className={styles.navLink + (pathName === '/' ? ' underline' : '')}>Home</a>
          </Link>
          <Link href="/debugger">
            <a className={styles.navLink + (pathName === '/debugger' ? ' underline' : '')}>
              Debugger
            </a>
          </Link>
          <a className={styles.navLink} target="_blank" href={links.home} rel="noopener noreferrer">
            About
          </a>
          <NetworkSelector />
        </div>
        <div className="relative flex item-center sm:hidden mr-2">
          <button className="hover:opactiy-70 transition-all" {...buttonProps}>
            <Image src={HamburgerIcon} width={22} height={22} />
          </button>
        </div>
      </div>
      {/* Dropdown menu, used on mobile */}
      <div className={`${styles.dropdownContainer} ${!isOpen && 'hidden'} right-0`} role="menu">
        <Link href="/">
          <a {...itemProps[0]} className={styles.dropdownOption} onClick={closeDropdown}>
            <DropdownItemContent icon={HouseIcon} text="Home" />
          </a>
        </Link>
        <Link href="/debugger">
          <a {...itemProps[1]} className={styles.dropdownOption} onClick={closeDropdown}>
            <DropdownItemContent icon={BugIcon} text="Debug" />
          </a>
        </Link>
        <a
          {...itemProps[2]}
          onClick={closeDropdown}
          className={styles.dropdownOption}
          target="_blank"
          href={links.docs}
          rel="noopener noreferrer"
        >
          <DropdownItemContent icon={BookIcon} text="Docs" />
        </a>
        <a
          {...itemProps[3]}
          onClick={closeDropdown}
          className={styles.dropdownOption}
          target="_blank"
          href={links.home}
          rel="noopener noreferrer"
        >
          <DropdownItemContent icon={InfoIcon} text="About" />
        </a>
        <a
          {...itemProps[4]}
          onClick={closeDropdown}
          className={styles.dropdownOption}
          href={isMainnet ? allConfigs.testnet2.url : allConfigs.mainnet.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <DropdownItemContent icon={HubIcon} text={isMainnet ? 'Testnet' : 'Mainnet'} />
        </a>
      </div>
    </header>
  );
}

function DropdownItemContent({ icon, text }: { icon: any; text: string }) {
  return (
    <>
      <Image src={icon} width={18} height={18} className="opacity-70 mr-2.5" />
      <span>{text}</span>
    </>
  );
}

function NetworkSelector() {
  const { buttonProps, itemProps, isOpen, setIsOpen } = useDropdownMenu(2);
  return (
    <div className="relative">
      <button className="flex items-center pb-px hover:opacity-60 transition-all" {...buttonProps}>
        <Image src={HubIcon} width={20} height={20} className="opacity-70" />
      </button>
      <div className={`${styles.dropdownContainer} ${!isOpen && 'hidden'} right-0`} role="menu">
        <a
          {...itemProps[0]}
          className={`${styles.dropdownOption} justify-center ${
            config.environment === Environment.Mainnet && styles.activeEnv
          }`}
          onClick={() => setIsOpen(false)}
          href={config.environment !== Environment.Mainnet ? allConfigs.mainnet.url : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          Mainnet
        </a>
        <a
          {...itemProps[1]}
          onClick={() => setIsOpen(false)}
          className={`${styles.dropdownOption} justify-center ${
            config.environment === Environment.Testnet2 && styles.activeEnv
          }`}
          href={config.environment !== Environment.Testnet2 ? allConfigs.testnet2.url : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          Testnet
        </a>
      </div>
    </div>
  );
}

const styles = {
  navLink:
    'flex items-center tracking-wide text-gray-600 text-[0.95rem] hover:underline hover:opacity-70 decoration-2 underline-offset-[6px] transition-all',
  dropdownContainer: 'dropdown-menu w-[7.5rem] mt-1 mr-px bg-gray-50',
  dropdownOption:
    'flex items-center cursor-pointer p-2 mt-1 rounded text-gray-600 hover:underline decoration-2 underline-offset-4 transition-all',
  activeEnv: 'font-medium cursor-default hover:no-underline',
};
