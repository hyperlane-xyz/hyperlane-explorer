// Mostly copied from https://github.com/hyperlane-xyz/hyperlane-website/blob/main/src/components/nav/Footer.tsx
import Image from 'next/image';
import Link from 'next/link';

import { links } from '../../consts/links';
// import FooterLine from '../../images/footer/footer-line-desktop.svg';
// import FooterLineMobile from '../../images/footer/footer-line-mobile.svg';
import FooterBg from '../../images/footer/footer-bg.svg';
import FooterLogo from '../../images/footer/footer-logo.svg';
import FooterTopBorder from '../../images/footer/footer-top-border.svg';
import { Discord } from '../icons/Discord';
import { Github } from '../icons/Github';
import { Medium } from '../icons/Medium';
import { Twitter } from '../icons/Twitter';

const footerLinks1 = [
  { title: 'Docs', url: links.docs, external: true },
  { title: 'Homepage', url: links.home, external: true },
  { title: 'Chains', url: links.chains, external: true },
];

const footerLinks2 = [
  { title: 'Crew', url: `${links.home}/crew`, external: true },
  { title: 'Bounty', url: `${links.home}/bounty`, external: true },
  { title: 'Brand', url: links.brand, external: true },
];

const footerLinks3 = [
  { title: 'Twitter', url: links.twitter, external: true, icon: <Twitter fill="#fff" /> },
  { title: 'Discord', url: links.discord, external: true, icon: <Discord fill="#fff" /> },
  { title: 'Github', url: links.github, external: true, icon: <Github fill="#fff" /> },
  { title: 'Blog', url: links.blog, external: true, icon: <Medium fill="#fff" /> },
];

export function Footer() {
  return (
    <footer className="text-white ">
      <div className="relative">
        <Image className="relative z-0 w-full" src={FooterBg} alt="background" />
        <Image
          className="absolute z-10 bottom-[1.5rem] w-full h-auto"
          src={FooterTopBorder}
          alt="border"
        />
      </div>
      <div className="px-8 py-5 bg-pink-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-center">
            <div className="ml-2 h-20 w-20">
              <Image src={FooterLogo} alt="footer-logo" />
            </div>
            <div className="text-2xl font-medium ml-6 space-y-1 ">
              <div>Go Interchain</div>
              <div>With Hyperlane</div>
            </div>
            {/* <div className="absolute">
            <div className="hidden sm:block">
              <Image src={FooterLine} alt="" />
            </div>
            <div className="sm:hidden">
              <Image src={FooterLineMobile} alt="" />
            </div>
          </div> */}
          </div>
          <div className="max-w-2xl">
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
                      {item?.icon && <div className="mr-4 w-6">{item?.icon}</div>}
                      <div className="">{item.title}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}

const styles = {
  linkCol: 'flex flex-col gap-3',
  linkItem: 'flex items-center capitalize text-decoration-none hover:underline underline-offset-2',
};
