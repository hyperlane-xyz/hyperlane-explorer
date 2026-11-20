import { IconButton } from '@hyperlane-xyz/widgets/components/IconButton';
import { SearchIcon } from '@hyperlane-xyz/widgets/icons/Search';
import { useRouter } from 'next/router';
import type { FormEvent } from 'react';

import { Color } from '../../styles/Color';
import { logger } from '../../utils/logger';

export function MiniSearchBar() {
  const router = useRouter();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = new FormData(event.currentTarget).get('search');
    if (typeof search !== 'string' || !search) return;
    router
      .push({ pathname: '/', query: { search } })
      .catch((error) => logger.error('Error opening search results', error));
  };

  return (
    <form action="/" onSubmit={onSubmit}>
      <div className="flex items-center rounded bg-white p-1 transition-all">
        <input
          name="search"
          type="search"
          aria-label="Hash or address"
          placeholder="Hash or address"
          className="h-8 w-36 rounded bg-white px-2.5 py-2 text-sm font-light transition-[width] duration-500 ease-in-out placeholder:text-gray-600 focus:w-64 focus:outline-none"
        />
        <div className="bg-accent-600 hover:bg-accent-700 flex h-8 w-8 items-center justify-center rounded duration-500">
          <IconButton type="submit" title="Search">
            <SearchIcon width={16} height={16} color={Color.white} />
          </IconButton>
        </div>
      </div>
    </form>
  );
}
