import { useQuery } from '@tanstack/react-query';
import Image from 'next/future/image';
import { useState } from 'react';

import { Fade } from '../../components/animation/Fade';
import { CopyButton } from '../../components/buttons/CopyButton';
import { SearchBar } from '../../components/search/SearchBar';
import {
  NoSearchError,
  SearchEmptyError,
  SearchInvalidError,
  SearchUnknownError,
} from '../../components/search/SearchError';
import { envDisplayValue } from '../../consts/environments';
import ShrugIcon from '../../images/icons/shrug.svg';
import { useStore } from '../../store';
import useDebounce from '../../utils/debounce';
import { sanitizeString } from '../../utils/string';
import { isValidSearchQuery } from '../search/utils';

import { MessageDebugResult, TxDebugStatus, debugMessageForHash } from './debugMessage';

export function TxDebugger() {
  const environment = useStore((s) => s.environment);

  // Search text input
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchInput = useDebounce(searchInput, 750);
  const hasInput = !!debouncedSearchInput;
  const sanitizedInput = sanitizeString(debouncedSearchInput);
  const isValidInput = isValidSearchQuery(sanitizedInput, false);

  const {
    isLoading: fetching,
    isError: hasError,
    data,
  } = useQuery(
    ['debugMessage', isValidInput, sanitizedInput, environment],
    () => {
      if (!isValidInput || !sanitizedInput) return null;
      else return debugMessageForHash(sanitizedInput, environment);
    },
    { retry: false },
  );

  return (
    <>
      <SearchBar
        value={searchInput}
        onChangeValue={setSearchInput}
        fetching={fetching}
        placeholder="Search transaction hash to debug message"
      />
      <div className="w-full h-[38.05rem] mt-5 bg-white shadow-md border border-blue-50 rounded overflow-auto relative">
        <div className="px-2 py-3 sm:px-4 md:px-5 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-gray-600">{`Transaction Debugger (${envDisplayValue[environment]})`}</h2>
        </div>

        <Fade show={isValidInput && !hasError && !!data}>
          <div className="px-2 sm:px-4 md:px-5">
            <DebugResult result={data} />
          </div>
        </Fade>
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

function DebugResult({ result }: { result: MessageDebugResult | null | undefined }) {
  if (!result) return null;

  if (result.status === TxDebugStatus.NotFound) {
    return (
      <div className="py-8 flex flex-col items-center">
        <Image src={ShrugIcon} width={110} className="opacity-80" />
        <h2 className="mt-4 text-lg text-gray-600">No transaction found</h2>
        <p className="mt-4 leading-relaxed">{result.details}</p>
      </div>
    );
  }

  if (result.status === TxDebugStatus.NoMessages) {
    return (
      <div className="py-8 flex flex-col items-center">
        <Image src={ShrugIcon} width={110} className="opacity-80" />
        <h2 className="mt-4 text-lg text-gray-600">No message found</h2>
        <p className="mt-4 leading-relaxed">{result.details}</p>
        <TxExplorerLink href={result.explorerLink} />
      </div>
    );
  }

  if (result.status === TxDebugStatus.MessagesFound) {
    return (
      <>
        {result.messageDetails.map((m, i) => (
          <div className="border-b border-gray-200 py-4" key={`message-${i}`}>
            <h2 className="text-lg text-gray-600">{`Message ${i + 1} / ${
              result.messageDetails.length
            }`}</h2>
            <p className="mt-2 leading-relaxed">{m.summary}</p>
            <div className="mt-2 text-sm">
              {Array.from(m.properties.entries()).map(([key, val]) => (
                <div className="flex mt-1" key={`message-${i}-prop-${key}`}>
                  <label className="text-gray-600 w-32">{key}</label>
                  <div className="relative ml-2 truncate max-w-xs sm:max-w-sm md:max-w-lg">
                    {val}
                  </div>
                  {val.length > 20 && (
                    <CopyButton copyValue={val} width={12} height={12} classes="ml-2" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <TxExplorerLink href={result.explorerLink} />
      </>
    );
  }

  return null;
}

function TxExplorerLink({ href }: { href: string | undefined }) {
  if (!href) return null;
  return (
    <a
      className="block my-5 text-blue-600 hover:text-blue-500 underline underline-offset-4"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      View transaction in explorer
    </a>
  );
}
