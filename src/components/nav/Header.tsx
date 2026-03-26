import { ChevronIcon } from '@hyperlane-xyz/widgets';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { PropsWithChildren, useEffect, useEffectEvent, useRef, useState } from 'react';

import { docLinks, links } from '../../consts/links';
import { useScrollThresholdListener } from '../../utils/useScrollListener';
import LogoLockup from '/public/images/hyperlane-explorer-logo.svg';

const MiniSearchBar = dynamic(
  () => import('../search/MiniSearchBar').then((mod) => mod.MiniSearchBar),
  {
    loading: () => <div className="h-10 w-44 rounded bg-white/10" />,
    ssr: false,
  },
);

const PAGES_EXCLUDING_SEARCH = ['/', '/debugger'];

export function Header({ pathName }: { pathName: string }) {
  // For dynamic sizing on scroll
  const animateHeader = useScrollThresholdListener(100);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const showSearch = !PAGES_EXCLUDING_SEARCH.includes(pathName);

  const navLinkClass = (path?: string) =>
    path && pathName === path ? styles.navLink + ' underline' : styles.navLink;

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathName]);

  const onPointerDown = useEffectEvent((event: MouseEvent | TouchEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (mobileMenuRef.current?.contains(target)) return;
    setIsMobileMenuOpen(false);
  });

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') setIsMobileMenuOpen(false);
  });

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header
      className={`sticky top-0 z-20 w-full bg-black/10 px-2 backdrop-blur-md transition-all duration-200 ease-in-out sm:px-6 lg:px-12 ${
        animateHeader ? 'py-1' : 'py-4 sm:py-5'
      }`}
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center">
          {/* Add a minimal rotation here to trick the browser to go into hardware acceleration mode
            this will make the animation a little smoother, specially for Firefox*/}
          <div
            className={`flex items-center ${
              animateHeader && 'rotate-[0.01deg] scale-90'
            } transition-all duration-500 ease-in-out`}
          >
            <Image src={LogoLockup} alt="Hyperlane Explorer" className="h-8 w-auto sm:h-10" />
          </div>
        </Link>
        <nav
          className={`hidden sm:flex sm:min-h-[40px] sm:items-center sm:space-x-8 ${
            !showSearch ? 'md:space-x-10' : ''
          }`}
        >
          <Link href="/" className={navLinkClass('/')}>
            HOME
          </Link>
          <a className={navLinkClass()} target="_blank" href={links.home} rel="noopener noreferrer">
            ABOUT
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
            DOCS
          </a>
          {showSearch && <MiniSearchBar />}
        </nav>
        {/* Dropdown menu, used on mobile */}
        <div className="relative mr-2 flex items-center sm:hidden" ref={mobileMenuRef}>
          <button
            type="button"
            aria-expanded={isMobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="rounded border border-white bg-primary-500 px-4 py-1 transition-all hover:opacity-80 active:opacity-70"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            <DropdownButton />
          </button>
          {isMobileMenuOpen && (
            <div className="absolute right-0 top-full mt-3 min-w-[12rem] bg-[rgba(13,6,18,0.95)] px-8 py-7 backdrop-blur-sm">
              <MobileNavLink href="/" closeDropdown={() => setIsMobileMenuOpen(false)}>
                HOME
              </MobileNavLink>
              <MobileNavLink href={docLinks.home} closeDropdown={() => setIsMobileMenuOpen(false)}>
                DOCS
              </MobileNavLink>
              <MobileNavLink href={links.home} closeDropdown={() => setIsMobileMenuOpen(false)}>
                ABOUT
              </MobileNavLink>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownButton() {
  return (
    <div className="flex flex-col items-center">
      <DropdownChevron className="transition-all" />
      <DropdownChevron className="-mt-1 transition-all" />
      <DropdownChevron className="-mt-1 transition-all" />
    </div>
  );
}

function DropdownChevron({ className }: { className?: string }) {
  return <ChevronIcon width={10} height={6} direction="s" className={`${className} text-white`} />;
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
      className="flex cursor-pointer items-center py-4 pl-3 decoration-primary-500 decoration-4 underline-offset-[2px] transition-all hover:underline active:opacity-80"
      onClick={closeDropdown}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      target={isExternal ? '_blank' : undefined}
    >
      <span className="text-xl font-medium uppercase text-white">{children}</span>
    </Link>
  );
}

const styles = {
  navLink:
    'flex items-center font-medium text-white tracking-wide hover:underline active:opacity-80 decoration-4 decoration-primary-500 underline-offset-[3px] transition-all',
};
