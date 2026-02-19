// Partly copied from https://github.com/hyperlane-xyz/hyperlane-website/blob/main/src/components/nav/Footer.tsx
import Image from 'next/image';
import Link from 'next/link';

import { GithubIcon, QuestionMarkIcon, TwitterIcon } from '@hyperlane-xyz/widgets';

import { docLinks, links } from '../../consts/links';
import Logo from '../../images/logos/hyperlane-logo.svg';
import { Color } from '../../styles/Color';

const footerLinks1 = [
  { title: 'Docs', url: docLinks.home, external: true },
  { title: 'Homepage', url: links.home, external: true },
  { title: 'Chains', url: docLinks.chains, external: true },
];

const footerLinks2 = [
  { title: 'Support', url: links.help, external: true },
  { title: 'Careers', url: links.jobs, external: true },
  { title: 'Brand', url: links.brand, external: true },
];

const footerLinks3 = [
  { title: 'X', url: links.twitter, external: true, icon: <TwitterIcon color={Color.white} /> },
  {
    title: 'Support',
    url: links.help,
    external: true,
    icon: <QuestionMarkIcon color={Color.white} />,
  },
  { title: 'Github', url: links.github, external: true, icon: <GithubIcon color={Color.white} /> },
];

export function Footer() {
  return (
    <footer className="relative z-10 bg-gradient-to-b from-transparent to-black/40 px-8 pb-5 pt-14 text-white">
      <div className="flex flex-col items-center justify-between gap-10 sm:flex-row">
        <div className="flex items-center justify-center">
          <Image src={Logo} alt="" className="h-12 w-auto sm:h-14" />
          <div className="ml-6 space-y-1 text-lg sm:text-xl">
            <div>Go interchain</div>
            <div>with Hyperlane</div>
          </div>
        </div>
        <nav className="flex">
          <ul className={`${styles.linkCol} mr-14`}>
            {footerLinks1.map((item) => (
              <li className="" key={item.title}>
                <Link
                  className={styles.linkItem}
                  target={item.external ? '_blank' : '_self'}
                  href={item.url}
                >
                  <div className="">{item.title}</div>
                </Link>
              </li>
            ))}
          </ul>
          <ul className={`${styles.linkCol} mr-14`}>
            {footerLinks2.map((item) => (
              <li key={item.title}>
                <Link
                  className={styles.linkItem}
                  target={item.external ? '_blank' : '_self'}
                  href={item.url}
                >
                  <div className="">{item.title}</div>
                </Link>
              </li>
            ))}
          </ul>
          <ul className={`${styles.linkCol}`}>
            {footerLinks3.map((item) => (
              <li key={item.title}>
                <Link
                  className={styles.linkItem}
                  target={item.external ? '_blank' : '_self'}
                  href={item.url}
                >
                  {item?.icon && <div className="mr-4 w-5">{item?.icon}</div>}
                  <div className="">{item.title}</div>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

const styles = {
  linkCol: 'flex flex-col gap-2',
  linkItem: 'flex items-center capitalize text-decoration-none hover:underline underline-offset-2',
};
