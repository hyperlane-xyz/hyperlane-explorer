import Image from 'next/future/image';
import { useMemo } from 'react';

import { SelectField } from '../../components/input/SelectField';
import { prodAndTestChains } from '../../consts/chains';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import { trimToLength } from '../../utils/string';

interface Props {
  originChainFilter: string;
  onChangeOriginFilter: (value: string) => void;
  destinationChainFilter: string;
  onChangeDestinationFilter: (value: string) => void;
}

export function SearchFilterBar({
  originChainFilter,
  onChangeOriginFilter,
  destinationChainFilter,
  onChangeDestinationFilter,
}: Props) {
  const chainOptions = useMemo(getChainOptionList, []);
  return (
    <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">
      <div className="w-px h-8 bg-gray-200"></div>
      <Image
        src={FunnelIcon}
        width={20}
        height={20}
        className="hidden sm:block opacity-20"
        alt=""
      />
      <SelectField
        classes="w-24 md:w-32"
        options={chainOptions}
        value={originChainFilter}
        onValueSelect={onChangeOriginFilter}
      />
      <Image src={ArrowRightIcon} width={30} height={30} className="opacity-30" alt="" />
      <SelectField
        classes="w-24 md:w-32"
        options={chainOptions}
        value={destinationChainFilter}
        onValueSelect={onChangeDestinationFilter}
      />
    </div>
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
