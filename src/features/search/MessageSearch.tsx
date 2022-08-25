import Image from 'next/future/image';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { Spinner } from '../../components/animation/Spinner';
import { IconButton } from '../../components/buttons/IconButton';
import { SelectField } from '../../components/input/SelectField';
import { prodChains } from '../../consts/networksConfig';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import SearchIcon from '../../images/icons/search.svg';
import XIcon from '../../images/icons/x.svg';
import { MOCK_TRANSACTION } from '../../test/mockMessages';
import { Message, MessageStatus } from '../../types';
import useDebounce from '../../utils/debounce';
import { sanitizeString } from '../../utils/string';

import { MessageSummary } from './MessageSummary';
import { isValidSearchQuery } from './utils';

export function MessageSearch() {
  // Search text input
  const [searchInput, setSearchInput] = useState('');
  const onChangeSearch = (event: ChangeEvent<HTMLInputElement> | null) => {
    const value = event?.target?.value || '';
    setSearchInput(value);
  };
  const debouncedSearchInput = useDebounce(searchInput, 750);

  // Filter state and handlers
  const chainOptions = useMemo(getChainOptionList, []);
  const [originChainFilter, setOriginChainFilter] = useState('');
  const [destinationChainFilter, setDestinationChainFilter] = useState('');
  const onChangeOriginFilter = (value: string) => {
    setOriginChainFilter(value);
  };
  const onChangeDestinationFilter = (value: string) => {
    setDestinationChainFilter(value);
  };

  // GraphQL query and results
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const hasInput = !!sanitizedInput;
  const query = hasInput ? searchMessagesQuery : latestMessagesQuery;
  const variables = hasInput ? { search: sanitizedInput } : undefined;
  const isValid = hasInput ? isValidSearchQuery(sanitizedInput) : true;
  //TODO remove
  console.log('san:', sanitizedInput, 'query:', query, 'valid:', isValid);
  const [result, reexecuteQuery] = useQuery<MessagesResult>({
    query,
    variables,
    pause: !isValid,
  });
  const { data, fetching, error } = result;
  const messageList = useMemo(() => parseResultData(data), [data]);
  useEffect(() => {
    if (!error) return;
    toast.error(`Error: ${error.message}`);
  }, [error]);
  // TODO add useInterval re-executor for latest

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
          {fetching && <Spinner classes="scale-[30%] mr-2.5" />}
          {!fetching && !searchInput && (
            <Image src={SearchIcon} alt="Search" width={20} height={20} />
          )}
          {!fetching && searchInput && (
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
      <div className="w-full h-[38.05rem] mt-5 bg-white shadow-md rounded overflow-auto">
        <div className="px-2 py-3 sm:px-4 md:px-5 md:py-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-500 black-shadow">
            {!hasInput ? 'Latest Messages' : 'Search Results'}
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
        {/* TODO content for invalid search, empty list, and maybe error (instead of toast) */}
        {messageList.map((m) => (
          <div
            key={`message-${m.id}`}
            className={`px-2 py-2 sm:px-4 md:px-5 md:py-3 border-b border-gray-100 hover:bg-gray-50 ${
              fetching && 'blur-sm'
            } transition-all duration-500`}
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

function parseResultData(data: MessagesResult | undefined): Message[] {
  // if (!data?.messages?.length) return PLACEHOLDER_MESSAGES; TODO
  if (!data?.messages?.length) return [];
  return data.messages.map((m) => ({
    id: m.id,
    status: m.status as MessageStatus,
    sender: m.sender,
    recipient: m.recipient,
    body: m.body,
    originChainId: m.originchainid,
    originTimeSent: m.origintimesent,
    destinationChainId: m.destinationchainid,
    destinationTimeSent: m.destinationtimesent,
    originTransaction: MOCK_TRANSACTION,
    destinationTransaction: MOCK_TRANSACTION,
  }));
}

// TODO automatic typings
const latestMessagesQuery = `
  query latestMessages {
    messages(order_by: {origintimesent: desc}, limit: 8) {
      id
      status
      sender
      recipient
      body
      originchainid
      origintimesent
      destinationchainid
      destinationtimesent
    }
  }
`;

const searchMessagesQuery = `
query searchMessages ($search: String!) {
  messages (search: $search, order_by: {origintimesent: desc}, limit: 8) {
    id
    status
    sender
    recipient
    body
    originchainid
    origintimesent
    destinationchainid
    destinationtimesent
  }
}
`;

interface MessageEntry {
  id: string;
  status: string;
  sender: string;
  recipient: string;
  body: string;
  originchainid: number;
  origintimesent: number;
  destinationchainid: number;
  destinationtimesent: number;
}

interface MessagesResult {
  messages: MessageEntry[];
}
