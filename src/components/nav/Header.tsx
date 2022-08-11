import Image from 'next/future/image';
import Link from 'next/link';

import Logo from '../../images/logos/abacus-with-name.svg';

export function Header() {
  return (
    <header className="w-screen py-5 px-3 sm:pl-5 sm:pr-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <a className="flex items-center">
            <div className="flex scale-90 sm:scale-100">
              <Image
                src={Logo}
                alt="Abacus Logo"
                quality={100}
                width={140}
                height={40}
              />
            </div>
            <div
              style={{ fontSize: '2rem' }}
              className="font-serif text-green-500 ml-2 pt-px"
            >
              Explorer
            </div>
          </a>
        </Link>
        <div className="flex space-x-12">
          <Link href="/">
            <a className="flex items-center text-lg">Home</a>
          </Link>
          <a
            className="flex items-center text-lg"
            target="_blank"
            href="https://docs.useabacus.network"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            className="flex items-center text-lg"
            target="_blank"
            href="https://www.useabacus.network"
            rel="noopener noreferrer"
          >
            About
          </a>
        </div>
      </div>
    </header>
  );
}
