import Image from 'next/image';
import { ChangeEvent } from 'react';

import { IconButton, SpinnerIcon, XIcon } from '@hyperlane-xyz/widgets';

import SearchIcon from '../../images/icons/search.svg';
import { Color } from '../../styles/Color';

interface Props {
  value: string;
  placeholder: string;
  onChangeValue: (v: string) => void;
  isFetching: boolean;
}

export function SearchBar({ value, placeholder, onChangeValue, isFetching }: Props) {
  const onChange = (event: ChangeEvent<HTMLInputElement> | null) => {
    const value = event?.target?.value || '';
    onChangeValue(value);
  };

  return (
    <div className="flex w-full items-center rounded-full bg-white p-1 transition-all duration-500">
      <input
        value={value}
        onChange={onChange}
        type="search"
        placeholder={placeholder}
        className="h-10 flex-1 rounded-full bg-white p-1 font-light placeholder:text-gray-600 focus:outline-none sm:h-12 sm:px-4 md:px-5"
      />

      {isFetching && (
        <div className={iconStyle}>
          <SpinnerIcon color={Color.white} width={26} height={26} />
        </div>
      )}
      {!isFetching && !value && (
        <div className={iconStyle}>
          <Image src={SearchIcon} width={20} height={20} alt="" />
        </div>
      )}
      {!isFetching && value && (
        <div
          className={`${iconStyle} bg-accent-700 duration-500 hover:bg-primary-700 sm:h-12 sm:w-12`}
        >
          <IconButton
            title="Clear search"
            className="h-full w-full rounded-full"
            onClick={() => onChange(null)}
          >
            <XIcon width={16} height={16} color="white" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
const iconStyle =
  'flex h-10 w-10 items-center justify-center rounded-full bg-accent-700 sm:h-12 sm:w-12';
