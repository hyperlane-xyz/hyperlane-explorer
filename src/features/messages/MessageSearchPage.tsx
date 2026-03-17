import dynamic from 'next/dynamic';
import { MessageSearch } from './MessageSearch';

const ChainConfigSyncEffect = dynamic(
  () => import('../chains/ChainConfigSyncer').then((mod) => mod.ChainConfigSyncEffect),
  { ssr: false },
);

export function MessageSearchPage() {
  return (
    <>
      <ChainConfigSyncEffect />
      <MessageSearch />
    </>
  );
}
