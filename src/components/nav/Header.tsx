import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren, useEffect, useState } from 'react';

import { DropdownMenu } from '@hyperlane-xyz/widgets';

import { docLinks, links } from '../../consts/links';
import Explorer from '../../images/logos/hyperlane-explorer.svg';
import Logo from '../../images/logos/hyperlane-logo.svg';
import Name from '../../images/logos/hyperlane-name.svg';
import { Color } from '../../styles/Color';
import { HyperlaneWideChevron } from '../icons/Chevron';
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
      className={`z-10 sticky top-0 px-2 sm:px-6 lg:px-12 w-full bg-blue-500 transition-all ease-in-out duration-300 ${
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
            <Image src={Logo} alt="" className="h-7 sm:h-8 w-auto" />
            <Image src={Name} alt="Hyperlane" className="hidden sm:block h-6 w-auto mt-1 ml-3" />
            <Image src={Explorer} alt="Explorer" className="h-5 sm:h-6 w-auto mt-1 ml-2.5" />
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
            button={<DropdownButton />}
            buttonClassname="hover:opacity-80 active:opacity-70 transition-all"
            menuItems={[
              ({ close }) => (
                <MobileNavLink href="/" closeDropdown={close} key="Home">
                  Home
                </MobileNavLink>
              ),
              ({ close }) => (
                <MobileNavLink href="/settings" closeDropdown={close} key="Settings">
                  Settings
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
    <div className="px-4 py-1 flex flex-col items-center border border-white bg-pink-500 rounded-lg">
      <HyperlaneWideChevron
        width={10}
        height={14}
        direction="s"
        color={Color.white}
        classes="transition-all"
      />
      <HyperlaneWideChevron
        width={10}
        height={14}
        direction="s"
        color={Color.white}
        classes="-mt-1 transition-all"
      />
      <HyperlaneWideChevron
        width={10}
        height={14}
        direction="s"
        color={Color.white}
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
      <span className="text-xl font-medium text-white capitalize">{children}</span>
    </Link>
  );
}

const styles = {
  navLink:
    'flex items-center font-medium text-white tracking-wide hover:underline active:opacity-80 decoration-4 decoration-pink-500 underline-offset-[3px] transition-all',
  dropdownOption:
    'flex items-center cursor-pointer p-2 mt-1 rounded text-blue-500 font-medium hover:underline decoration-2 underline-offset-4 transition-all',
};
