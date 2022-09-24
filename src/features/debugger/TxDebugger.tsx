import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { Fade } from '../../components/animation/Fade';
import { SearchBar } from '../../components/search/SearchBar';
import {
  NoSearchError,
  SearchEmptyError,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchError';
import { envDisplayValue } from '../../consts/environments';
import { useStore } from '../../store';
import useDebounce from '../../utils/debounce';
import { sanitizeString } from '../../utils/string';
import { isValidSearchQuery } from '../search/utils';

import { debugMessageForHash } from './debugMessage';

export function TxDebugger() {
  const environment = useStore((s) => s.environment);

  // Search text input
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const isValidInput = isValidSearchQuery(sanitizedInput, false);

  // Debugger query
  const query = useCallback(() => {
    if (!isValidInput || !sanitizedInput) return null;
    else return debugMessageForHash(sanitizedInput, environment);
  }, [isValidInput, sanitizedInput, environment]);
  const { isLoading: fetching, error, data } = useQuery(['debugMessage'], query);
  const hasError = !!error;

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        fetching={fetching}
        placeholder="Search transaction hash to debug message"
      />
      <div className="w-full h-[38.05rem] mt-5 bg-white shadow-md border border-blue-50 rounded overflow-auto relative">
        <div className="px-2 py-3 sm:px-4 md:px-5 md:py-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-600">{`Transaction Debugger (${envDisplayValue[environment]})`}</h2>
        </div>

        <Fade show={isValidInput && !hasError && !!data}>{JSON.stringify(data)}</Fade>
        <SearchEmptyError
          show={isValidInput && !hasError && !fetching && !data}
          hasInput={hasInput}
          allowAddress={false}
        />
        <NoSearchError show={!hasInput && !hasError} />
        <SearchInvalidError show={hasInput && !hasError && !isValidInput} allowAddress={false} />
        <SearchUnknownError show={hasInput && hasError} />
      </div>
    </>
  );
}
