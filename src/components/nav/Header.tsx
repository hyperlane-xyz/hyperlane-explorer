import Image from 'next/image';
import Link from 'next/link';

import { links } from '../../consts/links';
import BookIcon from '../../images/icons/book.svg';
import DatabaseIcon from '../../images/icons/database.svg';
import GearIcon from '../../images/icons/gear.svg';
import HamburgerIcon from '../../images/icons/hamburger.svg';
import HouseIcon from '../../images/icons/house.svg';
import InfoIcon from '../../images/icons/info-circle.svg';
import Explorer from '../../images/logos/hyperlane-explorer.svg';
import Logo from '../../images/logos/hyperlane-logo.svg';
import Name from '../../images/logos/hyperlane-name.svg';
import { DropdownMenu } from '../layout/Dropdown';
import { MiniSearchBar } from '../search/MiniSearchBar';

const PAGES_EXCLUDING_SEARCH = ['/', '/debugger'];

export function Header({ pathName }: { pathName: string }) {
  const showSearch = !PAGES_EXCLUDING_SEARCH.includes(pathName);

  const navLinkClass = (path?: string) =>
    path && pathName === path
      ? styles.navLink + ' text-blue-500'
      : styles.navLink + ' text-gray-600';

  return (
    <header className="px-2 pt-4 pb-3 sm:pt-5 sm:px-6 lg:pr-14 w-full">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <div className="flex items-center scale-90 sm:scale-100">
            <Image src={Logo} width={22} alt="" />
            <Image src={Name} width={110} alt="Hyperlane" className="mt-0.5 ml-2" />
            <Image src={Explorer} width={108} alt="Explorer" className="mt-0.5 ml-2" />
          </div>
        </Link>
        <nav
          className={`hidden sm:flex sm:space-x-8 sm:items-center ${
            !showSearch ? 'md:space-x-10' : ''
          }`}
        >
          <Link href="/" className={navLinkClass('/')}>
            Home
          </Link>
          <Link href="/settings" className={navLinkClass('/settings')}>
            Settings
          </Link>
          <Link href="/api-docs" className={navLinkClass('/api-docs')}>
            API
          </Link>
          <a className={navLinkClass()} target="_blank" href={links.home} rel="noopener noreferrer">
            About
          </a>
          <a className={navLinkClass()} target="_blank" href={links.docs} rel="noopener noreferrer">
            Docs
          </a>
          {showSearch && <MiniSearchBar />}
        </nav>
        {/* Dropdown menu, used on mobile */}
        <div className="relative flex item-center sm:hidden mr-2">
          <DropdownMenu
            buttonContent={<Image src={HamburgerIcon} width={22} height={22} alt="..." />}
            buttonClasses="hover:opacity-80 active:opacity-70 transition-all"
            buttonTitle="Options"
            menuItems={[
              <Link href="/" className={styles.dropdownOption} key="dropdown-item-home">
                <DropdownItemContent icon={HouseIcon} text="Home" />
              </Link>,
              <Link href="/settings" className={styles.dropdownOption} key="dropdown-item-home">
                <DropdownItemContent icon={GearIcon} text="Settings" />
              </Link>,
              <Link href="/api-docs" className={styles.dropdownOption} key="dropdown-item-api">
                <DropdownItemContent icon={DatabaseIcon} text="API" />
              </Link>,
              <a
                className={styles.dropdownOption}
                target="_blank"
                href={links.docs}
                rel="noopener noreferrer"
                key="dropdown-item-docs"
              >
                <DropdownItemContent icon={BookIcon} text="Docs" />
              </a>,
              <a
                className={styles.dropdownOption}
                target="_blank"
                href={links.home}
                rel="noopener noreferrer"
                key="dropdown-item-about"
              >
                <DropdownItemContent icon={InfoIcon} text="About" />
              </a>,
            ]}
            menuClasses="p-2 w-32 right-0"
          />
        </div>
      </div>
    </header>
  );
}

function DropdownItemContent({ icon, text }: { icon: any; text: string }) {
  return (
    <>
      <Image src={icon} width={18} height={18} className="opacity-70 mr-2.5" alt="" />
      <span>{text}</span>
    </>
  );
}

const styles = {
  navLink:
    'pt-px flex items-center tracking-wide text-[0.95rem] hover:underline hover:opacity-80 active:opacity-70 decoration-2 underline-offset-[6px] transition-all',
  dropdownOption:
    'flex items-center cursor-pointer p-2 mt-1 rounded text-gray-600 hover:underline decoration-2 underline-offset-4 transition-all',
};
