import Image from 'next/image';

import { Fade, SpinnerIcon } from '@hyperlane-xyz/widgets';

import BugIcon from '../../images/icons/bug.svg';
import ErrorIcon from '../../images/icons/error-circle.svg';
import SearchOffIcon from '../../images/icons/search-off.svg';
import ShrugIcon from '../../images/icons/shrug.svg';

export function SearchFetching({ show, isPiFetching }: { show: boolean; isPiFetching?: boolean }) {
  return (
    // Absolute position for overlaying cross-fade
    <div className="absolute left-0 right-0 top-10">
      <Fade show={show}>
        <div className="my-10 flex justify-center">
          <div className="flex max-w-md flex-col items-center justify-center px-3 py-5">
            <div className="flex items-center justify-center">
              <SpinnerIcon width={40} height={40} />
            </div>
            <div className="mt-4 text-center font-light leading-loose text-gray-700">
              {isPiFetching ? 'Searching override chains for messages' : 'Searching for messages'}
            </div>
          </div>
        </div>
      </Fade>
    </div>
  );
}

export function SearchError({
  show,
  text,
  imgSrc,
  imgWidth,
}: {
  show: boolean;
  text: string;
  imgSrc: any;
  imgWidth: number;
}) {
  return (
    // Absolute position for overlaying cross-fade
    <div className="absolute left-0 right-0 top-10">
      <Fade show={show}>
        <div className="my-10 flex justify-center">
          <div className="flex max-w-md flex-col items-center justify-center px-3 py-5">
            <Image src={imgSrc} width={imgWidth} className="opacity-80" alt="" />
            <div className="mt-4 text-center font-light leading-loose text-gray-700">{text}</div>
          </div>
        </div>
      </Fade>
    </div>
  );
}

export function NoSearchError({ show }: { show: boolean }) {
  return (
    <SearchError
      show={show}
      imgSrc={BugIcon}
      text="Enter a transaction hash that involved at least one Hyperlane message to begin."
      imgWidth={50}
    />
  );
}

export function SearchInvalidError({
  show,
  allowAddress,
}: {
  show: boolean;
  allowAddress: boolean;
}) {
  return (
    <SearchError
      show={show}
      imgSrc={SearchOffIcon}
      text={`Sorry, that search input is not valid. Please try ${
        allowAddress ? 'an account address or ' : ''
      }a transaction hash like 0xABC123...`}
      imgWidth={70}
    />
  );
}

export function SearchEmptyError({
  show,
  hasInput,
  allowAddress,
}: {
  show: boolean;
  hasInput: boolean;
  allowAddress: boolean;
}) {
  return (
    <SearchError
      show={show}
      imgSrc={ShrugIcon}
      text={`Sorry, no results found. Please try ${
        hasInput
          ? allowAddress
            ? 'a different address or transaction hash'
            : 'a different transaction hash'
          : 'again later'
      }.`}
      imgWidth={110}
    />
  );
}

export function SearchUnknownError({ show }: { show: boolean }) {
  return (
    <SearchError
      show={show}
      imgSrc={ErrorIcon}
      text="Sorry, an error has occurred. Please try again later."
      imgWidth={70}
    />
  );
}

export function SearchChainError({ show }: { show: boolean }) {
  return (
    <SearchError
      show={show}
      imgSrc={ErrorIcon}
      text="Sorry, the origin or destination chain is invalid. Please try choosing another chain or cleaning your filters."
      imgWidth={70}
    />
  );
}
