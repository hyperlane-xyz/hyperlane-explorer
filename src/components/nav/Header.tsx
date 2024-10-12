import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren } from 'react';

import { DropdownMenu, WideChevron } from '@hyperlane-xyz/widgets';

import { docLinks, links } from '../../consts/links';
import Explorer from '../../images/logos/hyperlane-explorer.svg';
import Logo from '../../images/logos/hyperlane-logo.svg';
import Name from '../../images/logos/hyperlane-name.svg';
import { Color } from '../../styles/Color';
import { useScrollThresholdListener } from '../../utils/useScrollListener';
import { MiniSearchBar } from '../search/MiniSearchBar';

const PAGES_EXCLUDING_SEARCH = ['/', '/debugger'];

export function Header({ pathName }: { pathName: string }) {
  // For dynamic sizing on scroll
  const animateHeader = useScrollThresholdListener(100);

  const showSearch = !PAGES_EXCLUDING_SEARCH.includes(pathName);

  const navLinkClass = (path?: string) =>
    path && pathName === path ? styles.navLink + ' underline' : styles.navLink;

  return (
    <header
      className={`sticky top-0 z-10 w-full bg-blue-500 px-2 transition-all duration-200 ease-in-out sm:px-6 lg:px-12 ${
        animateHeader ? 'border-b border-white py-1' : 'py-4 sm:py-5'
      }`}
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <div
            className={`flex items-center ${
              animateHeader && 'scale-90'
            } transition-all duration-500 ease-in-out`}
          >
            <Image src={Logo} alt="" className="h-7 w-auto sm:h-8" />
            <Image src={Name} alt="Hyperlane" className="ml-3 mt-1 hidden h-6 w-auto sm:block" />
            <Image src={Explorer} alt="Explorer" className="ml-2.5 mt-1 h-5 w-auto sm:h-6" />
          </div>
        </Link>
        <nav
          className={`hidden sm:flex sm:items-center sm:space-x-8 ${
            !showSearch ? 'md:space-x-10' : ''
          }`}
        >
          <Link href="/" className={navLinkClass('/')}>
            Home
          </Link>
          <a className={navLinkClass()} target="_blank" href={links.home} rel="noopener noreferrer">
            About
          </a>
          {/* <Link href="/api-docs" className={navLinkClass('/api-docs')}>
            API
          </Link> */}
          <a
            className={navLinkClass()}
            target="_blank"
            href={docLinks.home}
            rel="noopener noreferrer"
          >
            Docs
          </a>
          {showSearch && <MiniSearchBar />}
        </nav>
        {/* Dropdown menu, used on mobile */}
        <div className="item-center relative mr-2 flex sm:hidden">
          <DropdownMenu
            button={<DropdownButton />}
            buttonClassname="hover:opacity-80 active:opacity-70 transition-all"
            menuItems={[
              ({ close }) => (
                <MobileNavLink href="/" closeDropdown={close} key="Home">
                  Home
                </MobileNavLink>
              ),
              //  ({ close }) => (
              //   <MobileNavLink href="/api" closeDropdown={c} key="API">
              //     API
              //   </MobileNavLink>
              // ),
              ({ close }) => (
                <MobileNavLink href={docLinks.home} closeDropdown={close} key="Docs">
                  Docs
                </MobileNavLink>
              ),
              ({ close }) => (
                <MobileNavLink href={links.home} closeDropdown={close} key="About">
                  About
                </MobileNavLink>
              ),
            ]}
            menuClassname="!left-0 !right-0 py-7 px-8 bg-blue-500"
          />
        </div>
      </div>
    </header>
  );
}

function DropdownButton() {
  return (
    <div className="flex flex-col items-center rounded-lg border border-white bg-pink-500 px-4 py-1">
      <WideChevron
        width={10}
        height={14}
        direction="s"
        color={Color.white}
        className="transition-all"
      />
      <WideChevron
        width={10}
        height={14}
        direction="s"
        color={Color.white}
        className="-mt-1 transition-all"
      />
      <WideChevron
        width={10}
        height={14}
        direction="s"
        color={Color.white}
        className="-mt-1 transition-all"
      />
    </div>
  );
}

function MobileNavLink({
  href,
  closeDropdown,
  children,
}: PropsWithChildren<{ href: string; closeDropdown?: () => void }>) {
  const isExternal = href.startsWith('http');
  return (
    <Link
      href={href}
      className="flex cursor-pointer items-center py-4 pl-3 decoration-pink-500 decoration-4 underline-offset-[2px] transition-all hover:underline active:opacity-80"
      onClick={closeDropdown}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      target={isExternal ? '_blank' : undefined}
    >
      <span className="text-xl font-medium capitalize text-white">{children}</span>
    </Link>
  );
}

const styles = {
  navLink:
    'flex items-center font-medium text-white tracking-wide hover:underline active:opacity-80 decoration-4 decoration-pink-500 underline-offset-[3px] transition-all',
  dropdownOption:
    'flex items-center cursor-pointer p-2 mt-1 rounded text-blue-500 font-medium hover:underline decoration-2 underline-offset-4 transition-all',
};
