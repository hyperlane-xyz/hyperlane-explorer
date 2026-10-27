import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

import { OGHead } from '../components/OGHead';
import { OG_BASE_URL } from '../consts/appMetadata';
import { MessageSearchLoading } from '../features/messages/MessageSearchLoading';

const MessageSearchPage = dynamic(
  () => import('../features/messages/MessageSearchPage').then((mod) => mod.MessageSearchPage),
  { ssr: false, loading: () => <MessageSearchLoading /> },
);

const HomePage: NextPage = () => {
  return (
    <>
      <OGHead
        url={OG_BASE_URL}
        image={`${OG_BASE_URL}/images/og-preview.png`}
        video={`${OG_BASE_URL}/og-video/home.mp4`}
      />
      <MessageSearchPage />
    </>
  );
};

export default HomePage;
