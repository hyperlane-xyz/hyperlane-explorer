import { ChainConfigSyncer } from '../chains/ChainConfigSyncer';
import { MessageSearch } from './MessageSearch';

export function MessageSearchPage() {
  return (
    <ChainConfigSyncer>
      <MessageSearch />
    </ChainConfigSyncer>
  );
}
