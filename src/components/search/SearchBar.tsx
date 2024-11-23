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
        className="h-10 flex-1 rounded-full p-1 font-light placeholder:text-gray-600 focus:outline-none sm:h-12 sm:px-4 md:px-5"
      />
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-500 sm:h-12 sm:w-12">
        {isFetching && <SpinnerIcon color={Color.white} width={26} height={26} />}
        {!isFetching && !value && <Image src={SearchIcon} width={20} height={20} alt="" />}
        {!isFetching && value && (
          <IconButton title="Clear search" onClick={() => onChange(null)}>
            <XIcon width={16} height={16} color="white" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
