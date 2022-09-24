import { useState } from 'react';

import { Fade } from '../../components/animation/Fade';
import { SearchBar } from '../../components/search/SearchBar';
import {
  SearchEmptyError,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchError';
import { envDisplayValue } from '../../consts/environments';
import { useStore } from '../../store';
import useDebounce from '../../utils/debounce';
import { sanitizeString } from '../../utils/string';
import { isValidSearchQuery } from '../search/utils';

export function TxDebugger() {
  const environment = useStore((s) => s.environment);

  // Search text input
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const isValidInput = hasInput ? isValidSearchQuery(sanitizedInput, false) : true;

  const fetching = false;
  const hasError = false;
  const txResult = {};

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        fetching={fetching}
        placeholder="Search transaction hash to debug message"
      />
      <div className="w-full h-[38.05rem] mt-5 bg-white shadow-md border border-blue-50 rounded overflow-auto relative">
        {/* Content header and filter bar */}
        <div className="px-2 py-3 sm:px-4 md:px-5 md:py-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-600">{`Transaction Debugger (${envDisplayValue[environment]})`}</h2>
        </div>
        {/* Message list */}
        <Fade show={!hasError && isValidInput && !!txResult}>{JSON.stringify(txResult)}</Fade>

        <SearchInvalidError show={!isValidInput} />
        <SearchUnknownError show={isValidInput && hasError} />
        <SearchEmptyError
          show={isValidInput && !hasError && !fetching && !txResult}
          hasInput={hasInput}
        />
      </div>
    </>
  );
}
