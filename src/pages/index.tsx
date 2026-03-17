import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

const MessageSearchPage = dynamic(
  () => import('../features/messages/MessageSearchPage').then((mod) => mod.MessageSearchPage),
  { ssr: false },
);

const HomePage: NextPage = () => {
  return <MessageSearchPage />;
};

export default HomePage;
