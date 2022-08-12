import Image from 'next/future/image';
import { ChangeEvent, useMemo, useState } from 'react';

import { SelectField } from '../../components/input/SelectField';
import { Card } from '../../components/layout/Card';
import { prodChains } from '../../consts/networksConfig';
import ArrowRightIcon from '../../images/icons/arrow-right.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import SearchIcon from '../../images/icons/search.svg';
import { MOCK_MESSAGES } from '../../test/mockMessages';

import { MessageSummary } from './MessageSummary';

// TODO search and filter
// TODO loading and error states
// TODO text grays with ting of green
export function MessageSearch() {
  const [searchInput, setSearchInput] = useState('');
  const [originChainFilter, setoriginChainFilter] = useState('');
  const [destinationChainFilter, setDestinationChainFilter] = useState('');

  const chainOptions = useMemo(getChainOptionList, []);

  const onChangeSearch = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
  };

  const onChangeoriginFilter = (value: string) => {
    setoriginChainFilter(value);
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
          placeholder="Search for messages by address, transaction hash, or block hash"
          className="p2 sm:p-4 flex-1 h-12 sm:h-14 rounded focus:outline-none"
        />
        <div className="bg-beige-500 h-12 sm:h-14 w-12 sm:w-14 flex items-center justify-center rounded">
          <Image src={SearchIcon} alt="Search" width={20} height={20} />
        </div>
      </div>
      <Card width="w-full" classes="mt-6 p-0">
        <div className="p-4 flex items-center justify-between border-b border-gray-300">
          <h2 className="text-gray-800">Latest Messages</h2>
          <div className="flex items-center space-x-3">
            <div className="w-px h-8 bg-gray-300"></div>
            <Image src={FunnelIcon} alt="Filter" width={22} height={22} />
            <SelectField
              classes="w-32"
              options={chainOptions}
              value={originChainFilter}
              onValueSelect={onChangeoriginFilter}
            />
            <Image
              src={ArrowRightIcon}
              alt="Arrow-right"
              width={24}
              height={24}
            />
            <SelectField
              classes="w-32"
              options={chainOptions}
              value={destinationChainFilter}
              onValueSelect={onChangeDestinationFilter}
            />
          </div>
        </div>
        {MOCK_MESSAGES.map((m) => (
          <div key={`message-${m.id}`} className="px-4 py-3 border-b">
            <MessageSummary message={m} />
          </div>
        ))}
      </Card>
    </>
  );
}

function getChainOptionList(): Array<{ value: string; display: string }> {
  return [
    { value: '', display: 'All Chains' },
    ...prodChains.map((c) => ({ value: c.id.toString(), display: c.name })),
  ];
}
