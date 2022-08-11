import Image from 'next/future/image';

import { FloatingBox } from '../../components/layout/FloatingBox';
import SearchIcon from '../../images/icons/search.svg';

// TODO text grays with ting of green
export function SearchForm() {
  return (
    <div className="relative z-20">
      <div className="flex items-center bg-white w-full rounded-sm">
        <input
          type="text"
          placeholder="Search for messages by address, transaction hash, or block hash"
          className="p2 sm:p-4 flex-1 h-12 sm:h-14 rounded-sm focus:outline-none"
        />
        <div className="bg-beige-500 h-12 sm:h-14 w-12 sm:w-14 flex items-center justify-center rounded-sm">
          <Image src={SearchIcon} alt="Search" width={20} height={20} />
        </div>
      </div>
      <FloatingBox width="w-full" classes="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-gray-800">Latest Messages</h2>
          <div className="flex items-center">
            <Image src={SearchIcon} alt="Filter" width={14} height={14} />
          </div>
        </div>
      </FloatingBox>
    </div>
  );
}
