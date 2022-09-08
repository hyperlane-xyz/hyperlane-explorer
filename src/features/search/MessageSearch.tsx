import Image from 'next/future/image';
import { ChangeEvent, useCallback, useMemo, useState } from 'react';
import { useQuery } from 'urql';

import { Fade } from '../../components/animation/Fade';
import { Spinner } from '../../components/animation/Spinner';
import { IconButton } from '../../components/buttons/IconButton';
import { SelectField } from '../../components/input/SelectField';
import { chainToDomain } from '../../consts/domains';
import { prodChains } from '../../consts/networksConfig';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import ErrorIcon from '../../images/icons/error-circle.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import SearchOffIcon from '../../images/icons/search-off.svg';
import SearchIcon from '../../images/icons/search.svg';
import ShrugIcon from '../../images/icons/shrug.svg';
import XIcon from '../../images/icons/x.svg';
import { trimLeading0x } from '../../utils/addresses';
import useDebounce from '../../utils/debounce';
import { sanitizeString, trimToLength } from '../../utils/string';
import { useInterval } from '../../utils/timeout';

import { MessageSummary } from './MessageSummary';
import { parseMessageStubResult } from './query';
import { MessagesStubQueryResult } from './types';
import { isValidSearchQuery } from './utils';

const AUTO_REFRESH_DELAY = 10000;
const LATEST_QUERY_LIMIT = 8;
const SEARCH_QUERY_LIMIT = 40;

export function MessageSearch() {
  // Search text input
  const [searchInput, setSearchInput] = useState('');
  const onChangeSearch = (event: ChangeEvent<HTMLInputElement> | null) => {
    const value = event?.target?.value || '';
    setSearchInput(value);
  };
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const isValidInput = hasInput ? isValidSearchQuery(sanitizedInput) : true;

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
  const { query, variables } = assembleQuery(
    sanitizedInput,
    originChainFilter,
    destinationChainFilter,
  );
  const [result, reexecuteQuery] = useQuery<MessagesStubQueryResult>({
    query,
    variables,
    pause: !isValidInput,
  });
  const { data, fetching, error } = result;
  const messageList = useMemo(() => parseMessageStubResult(data), [data]);
  const hasError = !!error;
  const reExecutor = useCallback(() => {
    if (query && isValidInput) {
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  }, [reexecuteQuery, query, isValidInput]);
  useInterval(reExecutor, AUTO_REFRESH_DELAY);

  return (
    <>
      {/* Search bar */}
      <div className="flex items-center bg-white w-full rounded shadow-md border border-blue-50">
        <input
          value={searchInput}
          onChange={onChangeSearch}
          type="text"
          placeholder="Search for messages by address or transaction hash"
          className="p-2 sm:px-4 md:px-5 flex-1 h-10 sm:h-12 rounded focus:outline-none"
        />
        <div className="bg-beige-300 h-10 sm:h-12 w-10 sm:w-12 flex items-center justify-center rounded">
          {fetching && <Spinner classes="scale-[30%] mr-2.5" />}
          {!fetching && !searchInput && (
            <Image src={SearchIcon} width={20} height={20} />
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
      <div className="w-full h-[38.05rem] mt-5 bg-white shadow-md border border-blue-50 rounded overflow-auto relative">
        {/* Content header and filter bar */}
        <div className="px-2 py-3 sm:px-4 md:px-5 md:py-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-500 black-shadow">
            {!hasInput ? 'Latest Messages' : 'Search Results'}
          </h2>
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="w-px h-8 bg-gray-100"></div>
            <Image
              src={FunnelIcon}
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
        {/* Message list */}
        <Fade show={!hasError && isValidInput && messageList.length > 0}>
          {messageList.map((m) => (
            <div
              key={`message-${m.id}`}
              className={`px-2 py-2 sm:px-4 md:px-5 md:py-3 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 ${
                fetching && 'blur-xs'
              } transition-all duration-500`}
            >
              <MessageSummary message={m} />
            </div>
          ))}
        </Fade>
        {/* Invalid input state */}
        <SearchInfoBox
          show={!isValidInput}
          imgSrc={SearchOffIcon}
          imgAlt="Search invalid"
          text="Sorry, that search input is not valid. Please try an account
                addresses or a transaction hash like 0x123..."
          imgWidth={70}
        />
        {/* No results state */}
        <SearchInfoBox
          show={
            !hasError && !fetching && isValidInput && messageList.length === 0
          }
          imgSrc={ShrugIcon}
          imgAlt="No results"
          text={`Sorry, no results found. Please try ${
            hasInput ? 'a different address or hash' : 'again later'
          }.`}
          imgWidth={110}
        />
        {/* Search error state */}
        <SearchInfoBox
          show={hasError && isValidInput}
          imgSrc={ErrorIcon}
          imgAlt="Error"
          text="Sorry, an error has occurred. Please try a query or try again later."
          imgWidth={70}
        />
      </div>
    </>
  );
}

function SearchInfoBox({
  show,
  text,
  imgSrc,
  imgAlt,
  imgWidth,
}: {
  show: boolean;
  text: string;
  imgSrc: any;
  imgAlt: string;
  imgWidth: number;
}) {
  return (
    // Absolute position for overlaying cross-fade
    <div className="absolute left-0 right-0 top-10">
      <Fade show={show}>
        <div className="flex justify-center my-10">
          <div className="flex flex-col items-center justify-center max-w-md px-3 py-5">
            <Image
              src={imgSrc}
              alt={imgAlt}
              width={imgWidth}
              className="opacity-80"
            />
            <div className="mt-4 text-center leading-loose text-gray-700 black-shadow">
              {text}
            </div>
          </div>
        </div>
      </Fade>
    </div>
  );
}

function getChainOptionList(): Array<{ value: string; display: string }> {
  return [
    { value: '', display: 'All Chains' },
    ...prodChains.map((c) => ({
      value: c.id.toString(),
      display: trimToLength(c.name, 12),
    })),
  ];
}

function assembleQuery(
  searchInput: string,
  originFilter: string,
  destFilter: string,
) {
  const hasInput = !!searchInput;
  const variables = {
    search: hasInput ? trimLeading0x(searchInput) : undefined,
    originChain: originFilter ? chainToDomain[originFilter] : undefined,
    destinationChain: destFilter ? chainToDomain[destFilter] : undefined,
  };
  const limit = hasInput ? SEARCH_QUERY_LIMIT : LATEST_QUERY_LIMIT;

  const query = `
  query ($search: String, $originChain: Int, $destinationChain: Int) {
    message(
      where: {
        _and: [
          ${originFilter ? '{origin: {_eq: $originChain}},' : ''}
          ${destFilter ? '{destination: {_eq: $destinationChain}},' : ''}
          ${hasInput ? searchWhereClause : ''}
        ]
      },
      order_by: {timestamp: desc},
      limit: ${limit}
      ) {
        ${messageStubProps}
      }
  }
  `;
  return { query, variables };
}

const searchWhereClause = `
  {_or: [
    {sender: {_eq: $search}},
    {recipient: {_eq: $search}},
    {transaction: {hash: {_eq: $search}}},
    {transaction: {sender: {_eq: $search}}},
    {delivered_message: {transaction: {hash: {_eq: $search}}}},
    {delivered_message: {transaction: {sender: {_eq: $search}}}}
  ]}
`;

const messageStubProps = `
  id
  destination
  origin
  recipient
  sender
  timestamp
  delivered_message {
    id
    tx_id
    inbox_address
  }
  message_states {
    block_height
    block_timestamp
    error_msg
    estimated_gas_cost
    id
    processable
  }
`;
