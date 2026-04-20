import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

import { OGHead } from '../components/OGHead';
import { OG_BASE_URL } from '../consts/appMetadata';
import { links } from '../consts/links';
import { MessageSearchLoading } from '../features/messages/MessageSearchLoading';

const MessageSearchPage = dynamic(
  () => import('../features/messages/MessageSearchPage').then((mod) => mod.MessageSearchPage),
  { ssr: false, loading: () => <MessageSearchLoading /> },
);

const HomePage: NextPage = () => {
  return (
    <>
      <OGHead url={links.explorerUrl} image={`${OG_BASE_URL}/images/og-preview.png`} />
      <MessageSearchPage />
    </>
  );
};

export default HomePage;
