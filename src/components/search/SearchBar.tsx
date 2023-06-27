import Image from 'next/image';
import { ChangeEvent } from 'react';

import SearchIcon from '../../images/icons/search.svg';
import XIcon from '../../images/icons/x.svg';
import { Spinner } from '../animations/Spinner';
import { IconButton } from '../buttons/IconButton';

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
    <div className="p-1 flex items-center bg-white w-full rounded-full ring ring-blue-400 hover:ring-blue-200 transition-all duration-500">
      <input
        value={value}
        onChange={onChange}
        type="search"
        placeholder={placeholder}
        className="p-1 sm:px-4 md:px-5 flex-1 h-10 sm:h-12 font-light rounded-full placeholder:text-gray-600 focus:outline-none"
      />
      <div className="h-10 sm:h-12 w-10 sm:w-12 flex items-center justify-center rounded-full bg-pink-500">
        {isFetching && <Spinner classes="scale-[30%] mr-2.5 invert" />}
        {!isFetching && !value && <Image src={SearchIcon} width={20} height={20} alt="" />}
        {!isFetching && value && (
          <IconButton
            imgSrc={XIcon}
            title="Clear search"
            width={16}
            height={16}
            onClick={() => onChange(null)}
            classes="invert"
          />
        )}
      </div>
    </div>
  );
}
