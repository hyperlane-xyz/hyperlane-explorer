import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren, useEffect, useState } from 'react';

import { docLinks, links } from '../../consts/links';
import Explorer from '../../images/logos/hyperlane-explorer.svg';
import Logo from '../../images/logos/hyperlane-logo.svg';
import Name from '../../images/logos/hyperlane-name.svg';
import { Color } from '../../styles/Color';
import { HyperlaneWideChevron } from '../icons/Chevron';
import { DropdownMenu } from '../layout/Dropdown';
import { MiniSearchBar } from '../search/MiniSearchBar';

const PAGES_EXCLUDING_SEARCH = ['/', '/debugger'];

export function Header({ pathName }: { pathName: string }) {
  // For dynamic sizing on scroll
  const [animateHeader, setAnimateHeader] = useState(false);
  useEffect(() => {
    const listener = () => {
      if (window.scrollY > 100) {
        setAnimateHeader(true);
      } else setAnimateHeader(false);
    };
    window.addEventListener('scroll', listener);
    return () => {
      window.removeEventListener('scroll', listener);
    };
  }, []);

  const showSearch = !PAGES_EXCLUDING_SEARCH.includes(pathName);

  const navLinkClass = (path?: string) =>
    path && pathName === path ? styles.navLink + ' underline' : styles.navLink;

  return (
    <header
      className={`z-30 sticky top-0 px-2 sm:px-6 lg:px-12 w-full bg-blue-500 transition-all ease-in-out duration-500 ${
        animateHeader ? 'py-1 border-b border-white' : 'py-4 sm:py-5'
      }`}
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <div
            className={`flex items-center ${
              animateHeader && 'scale-90'
            } transition-all ease-in-out duration-500`}
          >
            <Image src={Logo} alt="" className="h-8 sm:h-10 w-auto" />
            <Image src={Name} alt="Hyperlane" className="hidden sm:block h-8 w-auto mt-1 ml-3" />
            <Image src={Explorer} alt="Explorer" className="h-7 sm:h-8 w-auto mt-1 ml-2.5" />
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
          <Link href="/settings" className={navLinkClass('/settings')}>
            Settings
          </Link>
          {showSearch && <MiniSearchBar />}
        </nav>
        {/* Dropdown menu, used on mobile */}
        <div className="relative flex item-center sm:hidden mr-2">
          <DropdownMenu
            ButtonContent={DropdownButton}
            buttonClasses="hover:opacity-80 active:opacity-70 transition-all"
            buttonTitle="Options"
            menuItems={[
              (c: Fn) => (
                <MobileNavLink href="/" closeDropdown={c} key="Home">
                  Home
                </MobileNavLink>
              ),
              (c: Fn) => (
                <MobileNavLink href="/settings" closeDropdown={c} key="Settings">
                  Settings
                </MobileNavLink>
              ),
              // (c: Fn) => (
              //   <MobileNavLink href="/api" closeDropdown={c} key="API">
              //     API
              //   </MobileNavLink>
              // ),
              (c: Fn) => (
                <MobileNavLink href={docLinks.home} closeDropdown={c} key="Docs">
                  Docs
                </MobileNavLink>
              ),
              (c: Fn) => (
                <MobileNavLink href={links.home} closeDropdown={c} key="About">
                  About
                </MobileNavLink>
              ),
            ]}
            menuClasses="pt-8 px-8"
            isFullscreen={true}
          />
        </div>
      </div>
    </header>
  );
}

function DropdownButton({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="px-4 py-1 flex flex-col items-center border border-white bg-pink-500 rounded-lg">
      <HyperlaneWideChevron
        width={10}
        height={14}
        direction={isOpen ? 'n' : 's'}
        color={Color.White}
        classes="transition-all"
      />
      <HyperlaneWideChevron
        width={10}
        height={14}
        direction={isOpen ? 'n' : 's'}
        color={Color.White}
        classes="-mt-1 transition-all"
      />
      <HyperlaneWideChevron
        width={10}
        height={14}
        direction={isOpen ? 'n' : 's'}
        color={Color.White}
        classes="-mt-1 transition-all"
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
      className="py-4 pl-3 flex items-center cursor-pointer hover:underline active:opacity-80 decoration-4 decoration-pink-500 underline-offset-[2px] transition-all"
      onClick={closeDropdown}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      target={isExternal ? '_blank' : undefined}
    >
      <span className="text-2xl font-medium text-white capitalize">{children}</span>
    </Link>
  );
}

const styles = {
  navLink:
    'flex items-center font-medium text-white tracking-wide hover:underline active:opacity-80 decoration-4 decoration-pink-500 underline-offset-[2px] transition-all',
  dropdownOption:
    'flex items-center cursor-pointer p-2 mt-1 rounded text-blue-500 font-medium hover:underline decoration-2 underline-offset-4 transition-all',
};
