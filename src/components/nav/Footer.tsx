// Partly copied from https://github.com/hyperlane-xyz/hyperlane-website/blob/main/src/components/nav/Footer.tsx
import Image from 'next/image';
import Link from 'next/link';

import { HyperlaneLogo } from '@hyperlane-xyz/widgets';

import { docLinks, links } from '../../consts/links';
import FooterBg from '../../images/backgrounds/footer-bg.svg';
import FooterTopBorder from '../../images/backgrounds/footer-top-border.svg';
import { Color } from '../../styles/Color';
import { Discord } from '../icons/Discord';
import { Github } from '../icons/Github';
import { Twitter } from '../icons/Twitter';

const footerLinks1 = [
  { title: 'Docs', url: docLinks.home, external: true },
  { title: 'Homepage', url: links.home, external: true },
  { title: 'Chains', url: docLinks.chains, external: true },
];

const footerLinks2 = [
  { title: 'Careers', url: 'https://jobs.lever.co/Hyperlane', external: true },
  {
    title: 'Bounty',
    url: 'https://github.com/search?q=org%3Ahyperlane-xyz+label%3Abounty+is%3Aopen+is%3Aissue&type=issues&s=&o=desc',
    external: true,
  },
  { title: 'Brand', url: links.brand, external: true },
];

const footerLinks3 = [
  { title: 'Twitter', url: links.twitter, external: true, icon: <Twitter fill="#fff" /> },
  { title: 'Discord', url: links.discord, external: true, icon: <Discord fill="#fff" /> },
  { title: 'Github', url: links.github, external: true, icon: <Github fill="#fff" /> },
];

export function Footer() {
  return (
    <footer className="text-white ">
      <div className="relative">
        <Image className="relative z-0 w-full" src={FooterBg} alt="background" />
        <Image
          className="absolute z-10 bottom-[1.6rem] w-full h-auto"
          src={FooterTopBorder}
          alt="border"
        />
      </div>
      <div className="px-8 py-5 bg-pink-500">
        <div className="flex flex-col sm:flex-row gap-10 items-center justify-between">
          <div className="flex items-center justify-center">
            <div className="ml-2 w-14 sm:w-16 h-14 sm:h-16">
              <HyperlaneLogo color={Color.white} />
            </div>
            <div className="text-xl sm:text-2xl font-medium ml-6 space-y-1 ">
              <div>Go interchain</div>
              <div>with Hyperlane</div>
            </div>
          </div>
          <nav className="flex text-lg font-medium">
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
            <ul className={`${styles.linkCol}  mr-14`}>
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
      </div>
    </footer>
  );
}

const styles = {
  linkCol: 'flex flex-col gap-2',
  linkItem: 'flex items-center capitalize text-decoration-none hover:underline underline-offset-2',
};
