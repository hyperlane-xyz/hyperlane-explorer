import Image from 'next/future/image';
import Link from 'next/link';
import useDropdownMenu from 'react-accessible-dropdown-menu-hook';

import Hamburger from '../../images/icons/hamburger.svg';
import Logo from '../../images/logos/abacus-with-name.svg';

export function Header() {
  const { buttonProps, itemProps, isOpen, setIsOpen } = useDropdownMenu(3);

  return (
    <header className="p-2 sm:py-3 sm:pl-6 sm:pr-8 w-full opacity-90">
      <div className="flex items-center justify-between">
        <Link href="/">
          <a className="flex items-center">
            <div className="flex scale-90 sm:scale-100">
              <Image
                src={Logo}
                alt="Abacus Logo"
                quality={100}
                width={130}
                height={35}
              />
            </div>
            <div className="font-serif text-[1.9rem] text-green-600 sm:ml-2 pt-px">
              Explorer
            </div>
          </a>
        </Link>
        <div className="hidden sm:flex sm:space-x-8 md:space-x-12">
          <Link href="/">
            <a className={styles.navLink}>Home</a>
          </Link>
          <a
            className={styles.navLink}
            target="_blank"
            href="https://docs.useabacus.network"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            className={styles.navLink}
            target="_blank"
            href="https://www.useabacus.network"
            rel="noopener noreferrer"
          >
            About
          </a>
        </div>
        <div className="relative flex item-center sm:hidden mr-2">
          <button className="hover:opactiy-70 transition-all" {...buttonProps}>
            <Image src={Hamburger} alt="Nav menu" width={26} height={26} />
          </button>
        </div>
      </div>
      <div
        className={`${styles.dropdownContainer} ${!isOpen && 'hidden'} right-0`}
        role="menu"
      >
        <Link href="/">
          <a
            {...itemProps[0]}
            className={styles.dropdownOption}
            onClick={() => setIsOpen(false)}
          >
            <div>Home</div>
          </a>
        </Link>
        <a
          {...itemProps[1]}
          onClick={() => setIsOpen(false)}
          className={styles.dropdownOption}
          target="_blank"
          href="https://docs.useabacus.network"
          rel="noopener noreferrer"
        >
          Docs
        </a>
        <a
          {...itemProps[2]}
          onClick={() => setIsOpen(false)}
          className={styles.dropdownOption}
          target="_blank"
          href="https://www.useabacus.network"
          rel="noopener noreferrer"
        >
          About
        </a>
      </div>
    </header>
  );
}

const styles = {
  navLink:
    'flex items-center font-medium tracking-wide opacity-90 hover:underline hover:opacity-70 decoration-2 underline-offset-4 transition-all',
  dropdownContainer: 'dropdown-menu w-28 mt-1 mr-px bg-beige-500',
  dropdownOption:
    'flex items-center justify-center cursor-pointer p-2 mt-1 rounded hover:underline',
};
