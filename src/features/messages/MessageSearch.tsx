import Image from 'next/future/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useQuery } from 'urql';

import { Fade } from '../../components/animation/Fade';
import { SelectField } from '../../components/input/SelectField';
import { SearchBar } from '../../components/search/SearchBar';
import {
  SearchEmptyError,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchError';
import { prodAndTestChains } from '../../consts/chains';
import { chainToDomain } from '../../consts/domains';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import { trimLeading0x } from '../../utils/addresses';
import useDebounce from '../../utils/debounce';
import { sanitizeString, trimToLength } from '../../utils/string';
import { useInterval } from '../../utils/timeout';

import { MessageSummary } from './MessageSummary';
import { parseMessageStubResult } from './query';
import { MessagesStubQueryResult } from './types';
import { isValidSearchQuery } from './utils';

const AUTO_REFRESH_DELAY = 10000;
const LATEST_QUERY_LIMIT = 12;
const SEARCH_QUERY_LIMIT = 40;

let showedWarning = false;

export function MessageSearch() {
  // TODO remove when live for real
  useEffect(() => {
    if (!showedWarning) {
      showedWarning = true;
      toast.info(
        'Welcome! This explorer is still under construction but feel free to look around!',
      );
    }
  }, []);

  // Search text input
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const isValidInput = hasInput ? isValidSearchQuery(sanitizedInput, true) : true;

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
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        fetching={fetching}
        placeholder="Search for messages by address or transaction hash"
      />
      <div className="w-full min-h-[38rem] max-h-[47rem] mt-5 bg-white shadow-md border border-blue-50 rounded overflow-auto relative">
        {/* Content header and filter bar */}
        <div className="px-2 py-3 sm:px-4 md:px-5 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-600">{!hasInput ? 'Latest Messages' : 'Search Results'}</h2>
          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">
            <div className="w-px h-8 bg-gray-100"></div>
            <Image
              src={FunnelIcon}
              width={22}
              height={22}
              className="hidden sm:block opacity-50"
              alt=""
            />
            <SelectField
              classes="w-24 md:w-32"
              options={chainOptions}
              value={originChainFilter}
              onValueSelect={onChangeOriginFilter}
            />
            <Image src={ArrowRightIcon} width={30} height={30} className="opacity-50" alt="" />
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
              className={`px-2 py-2 sm:px-4 md:px-5 md:py-2.5 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 ${
                fetching && 'blur-xs'
              } transition-all duration-500`}
            >
              <MessageSummary message={m} />
            </div>
          ))}
        </Fade>

        <SearchInvalidError show={!isValidInput} allowAddress={true} />
        <SearchUnknownError show={isValidInput && hasError} />
        <SearchEmptyError
          show={isValidInput && !hasError && !fetching && messageList.length === 0}
          hasInput={hasInput}
          allowAddress={true}
        />
      </div>
    </>
  );
}

function getChainOptionList(): Array<{ value: string; display: string }> {
  return [
    { value: '', display: 'All Chains' },
    ...prodAndTestChains.map((c) => ({
      value: c.id.toString(),
      display: trimToLength(c.name, 12),
    })),
  ];
}

function assembleQuery(searchInput: string, originFilter: string, destFilter: string) {
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
