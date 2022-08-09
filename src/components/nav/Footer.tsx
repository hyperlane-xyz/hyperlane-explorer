import Image from 'next/future/image';

import { config } from '../../consts/appConfig';
import { BlockIndicator } from '../../features/blocks/BlockIndicator';
import Discord from '../../images/logos/discord.svg';
import Github from '../../images/logos/github.svg';
import Twitter from '../../images/logos/twitter.svg';

export function Footer() {
  return (
    <footer className="w-screen py-4 px-7">
      <div className="flex justify-between items-center">
        <div className="flex items-center opacity-90">
          <FooterIconLink
            to="https://twitter.com/Abacus_Network"
            imgSrc={Twitter}
            alt="Twitter"
          />
          <FooterIconLink
            to="https://github.com/abacus-network/abacus-nft"
            imgSrc={Github}
            alt="Github"
          />
          <FooterIconLink
            to={config.discordUrl}
            imgSrc={Discord}
            alt="Discord"
          />
        </div>
        <BlockIndicator />
      </div>
    </footer>
  );
}

function FooterIconLink({
  to,
  imgSrc,
  alt,
  last,
}: {
  to: string;
  imgSrc: any;
  alt: string;
  last?: boolean;
}) {
  return (
    <a
      href={to}
      target="_blank"
      rel="noopener noreferrer"
      className={last ? '' : 'mr-5'}
    >
      <Image src={imgSrc} alt={alt} width={25} height={25} />
    </a>
  );
}
