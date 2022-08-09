import Link from 'next/link';
import { useRouter } from 'next/router';
import { PropsWithChildren } from 'react';

import { FloatingBox } from '../layout/FloatingBox';

export function ContentFrame(props: PropsWithChildren) {
  const { pathname } = useRouter();

  return (
    <div className="flex flex-col justify-center items-center h-full">
      <div className="w-112 px-4 pt-2 pb-1 bg-red-400 rounded-t-lg">
        <h1 className="text-gray-50 text-center">Abacus Example Nft App</h1>
        <div className="flex justify-center mt-3 space-x-20">
          <PageNavLink href="/" active={!pathname.includes('transfer')}>
            Search
          </PageNavLink>
          <PageNavLink href="/transfer" active={pathname.includes('transfer')}>
            Transfer
          </PageNavLink>
        </div>
      </div>
      <FloatingBox width="w-112" classes="relative -top-1">
        {props.children}
      </FloatingBox>
    </div>
  );
}

function PageNavLink(
  props: PropsWithChildren<{ href: string; active: boolean }>,
) {
  const { href, active, children } = props;
  return (
    <Link href={href}>
      <a className="flex flex-col items-center transition-all hover:opacity-70 active:opacity-60">
        <h2
          className={`text-sm uppercase tracking-wide ${
            active ? 'text-gray-50' : 'text-gray-100'
          }`}
        >
          {children}
        </h2>
        <div
          className={`w-full mt-1 h-1 bg-gray-50 ${active ? '' : 'hidden'}`}
        />
      </a>
    </Link>
  );
}
