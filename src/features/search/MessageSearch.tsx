import Image from 'next/future/image';
import { ChangeEvent, useMemo, useState, useTransition } from 'react';

import { IconButton } from '../../components/buttons/IconButton';
import { SelectField } from '../../components/input/SelectField';
import { prodChains } from '../../consts/networksConfig';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import SearchIcon from '../../images/icons/search.svg';
import XIcon from '../../images/icons/x.svg';
import { MOCK_MESSAGES } from '../../test/mockMessages';
import { Message } from '../../types';

import { MessageSummary } from './MessageSummary';

// TODO search and filter
// TODO loading and error states
// TODO text grays with ting of green
export function MessageSearch() {
  // Search state and handlers
  const [isPending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const onChangeSearch = (event: ChangeEvent<HTMLInputElement> | null) => {
    const value = event?.target?.value || '';
    setSearchInput(value);
    startTransition(() => {
      setSearchQuery(value);
    });
  };

  const searchResults = useMemo(
    () => findMessageWithValue(searchQuery, MOCK_MESSAGES),
    [searchQuery],
  );

  // Filter state and handlers
  const [originChainFilter, setOriginChainFilter] = useState('');
  const [destinationChainFilter, setDestinationChainFilter] = useState('');

  const chainOptions = useMemo(getChainOptionList, []);

  const onChangeOriginFilter = (value: string) => {
    setOriginChainFilter(value);
  };

  const onChangeDestinationFilter = (value: string) => {
    setDestinationChainFilter(value);
  };

  return (
    <>
      <div className="flex items-center bg-white w-full rounded shadow-md">
        <input
          value={searchInput}
          onChange={onChangeSearch}
          type="text"
          placeholder="Search for messages by address or transaction hash"
          className="p-2 sm:px-4 md:px-5 flex-1 h-10 sm:h-12 rounded focus:outline-none"
        />
        <div className="bg-beige-500 h-10 sm:h-12 w-10 sm:w-12 flex items-center justify-center rounded">
          {isPending && (
            <Image src={SearchIcon} alt="Search" width={20} height={20} />
          )}
          {!isPending && !searchQuery && (
            <Image src={SearchIcon} alt="Search" width={20} height={20} />
          )}
          {!isPending && searchQuery && (
            <IconButton
              imgSrc={XIcon}
              title="Clear search"
              width={28}
              height={28}
              onClick={() => onChangeSearch(null)}
            />
          )}
        </div>
      </div>
      <div
        style={{ height: '38.05rem' }}
        className="w-full mt-5 bg-white shadow-md rounded overflow-auto"
      >
        <div className="px-2 py-3 sm:px-4 md:px-5 md:py-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-800 black-shadow">
            {!searchQuery ? 'Latest Messages' : 'Search Results'}
          </h2>
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="w-px h-8 bg-gray-100"></div>
            <Image
              src={FunnelIcon}
              alt="Filter"
              width={22}
              height={22}
              className="opacity-50"
            />
            <SelectField
              classes="w-24 md:w-32"
              options={chainOptions}
              value={originChainFilter}
              onValueSelect={onChangeOriginFilter}
            />
            <Image
              src={ArrowRightIcon}
              alt="Arrow-right"
              width={30}
              height={30}
              className="opacity-50"
            />
            <SelectField
              classes="w-24 md:w-32"
              options={chainOptions}
              value={destinationChainFilter}
              onValueSelect={onChangeDestinationFilter}
            />
          </div>
        </div>
        {searchResults.map((m) => (
          <div
            key={`message-${m.id}`}
            className="px-2 py-2 sm:px-4 md:px-5 md:py-3 border-b border-gray-100 hover:bg-gray-50"
          >
            <MessageSummary message={m} />
          </div>
        ))}
      </div>
    </>
  );
}

function getChainOptionList(): Array<{ value: string; display: string }> {
  return [
    { value: '', display: 'All Chains' },
    ...prodChains.map((c) => ({ value: c.id.toString(), display: c.name })),
  ];
}

// TODO move this to backend
function findMessageWithValue(query: string, messages: Message[]) {
  if (!query) {
    return [...messages]
      .sort((a, b) => b.originTimeSent - a.originTimeSent)
      .slice(0, 8);
  }

  const normalizedQuery = query.trim().toLowerCase();
  return [...messages]
    .filter((m) => {
      return (
        m.sender.toLowerCase().includes(normalizedQuery) ||
        m.recipient.toLowerCase().includes(normalizedQuery) ||
        m.originTransaction.transactionHash
          .toLowerCase()
          .includes(normalizedQuery) ||
        (m.destinationTransaction &&
          m.destinationTransaction.transactionHash
            .toLowerCase()
            .includes(normalizedQuery))
      );
    })
    .sort((a, b) => b.originTimeSent - a.originTimeSent);
}
