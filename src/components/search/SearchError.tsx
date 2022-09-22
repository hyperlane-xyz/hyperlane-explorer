import Image from 'next/future/image';

import ErrorIcon from '../../images/icons/error-circle.svg';
import SearchOffIcon from '../../images/icons/search-off.svg';
import ShrugIcon from '../../images/icons/shrug.svg';
import { Fade } from '../animation/Fade';

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
        <div className="flex justify-center my-10">
          <div className="flex flex-col items-center justify-center max-w-md px-3 py-5">
            <Image src={imgSrc} width={imgWidth} className="opacity-80" />
            <div className="mt-4 text-center leading-loose text-gray-700">
              {text}
            </div>
          </div>
        </div>
      </Fade>
    </div>
  );
}

export function SearchInvalidError({ show }: { show: boolean }) {
  return (
    <SearchError
      show={show}
      imgSrc={SearchOffIcon}
      text="Sorry, that search input is not valid. Please try an account
          addresses or a transaction hash like 0x123..."
      imgWidth={70}
    />
  );
}

export function SearchEmptyError({
  show,
  hasInput,
}: {
  show: boolean;
  hasInput: boolean;
}) {
  return (
    <SearchError
      show={show}
      imgSrc={ShrugIcon}
      text={`Sorry, no results found. Please try ${
        hasInput ? 'a different address or hash' : 'again later'
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
      text="Sorry, an error has occurred. Please try a query or try again later."
      imgWidth={70}
    />
  );
}
