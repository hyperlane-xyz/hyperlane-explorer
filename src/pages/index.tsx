import type { NextPage } from 'next';
import dynamic from 'next/dynamic';

import { MessageSearchLoading } from '../features/messages/MessageSearchLoading';

const MessageSearchPage = dynamic(
  () => import('../features/messages/MessageSearchPage').then((mod) => mod.MessageSearchPage),
  { ssr: false, loading: () => <MessageSearchLoading /> },
);

const HomePage: NextPage = () => {
  return <MessageSearchPage />;
};

export default HomePage;
