import Image from 'next/future/image';
import { useMemo } from 'react';
import useDropdownMenu from 'react-accessible-dropdown-menu-hook';

import { mainnetAndTestChains, mainnetChains, testnetChains } from '../../consts/chains';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import { getChainDisplayName } from '../../utils/chains';
import { trimToLength } from '../../utils/string';
import { ChainIcon } from '../icons/ChainIcon';
import { CheckBox } from '../input/Checkbox';
import { SelectField } from '../input/SelectField';

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

  const { buttonProps, itemProps, isOpen, setIsOpen } = useDropdownMenu(1);
  const closeDropdown = () => {
    setIsOpen(false);
  };

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

      <div className="relative">
        <button className="hover:opacity-80 transition-all" {...buttonProps}>
          All Chains
        </button>

        <div
          className={`dropdown-menu w-88 -left-1 top-10 bg-white shadow-md drop-shadow-md xs:border-blue-50 ${
            !isOpen && 'hidden'
          }`}
          role="menu"
        >
          <ChainMultiSelector
            header="Origin Chains"
            value={originChainFilter}
            onChangeValue={onChangeOriginFilter}
          />
        </div>
      </div>
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

function ChainMultiSelector({
  header,
  value,
  onChangeValue,
}: {
  header: string;
  value: string;
  onChangeValue: (value: string) => void;
}) {
  return (
    <div className="p-1.5">
      <h3 className="text-gray-700 text-lg">{header}</h3>
      <div className="mt-2.5 flex space-x-6">
        <div className="flex flex-col space-y-1">
          <div className="pb-1.5">
            <CheckBox checked={true} onCheck={alert} name="mainnet-chains">
              <h4 className="ml-2 text-gray-700">Mainnet Chains</h4>
            </CheckBox>
          </div>
          {mainnetChains.map((c) => (
            <CheckBox key={c.name} checked={true} onCheck={alert} name={c.network}>
              <div className="ml-2 text-sm flex items-center">
                <span className="mr-1">{getChainDisplayName(c.id, true)}</span>
                <ChainIcon chainId={c.id} size={22} />
              </div>
            </CheckBox>
          ))}
        </div>
        <div className="self-stretch w-px my-1 bg-gray-300"></div>
        <div className="flex flex-col space-y-1">
          <div className="pb-1.5">
            <CheckBox checked={true} onCheck={alert} name="testnet-chains">
              <h4 className="ml-2 text-gray-700">Testnet Chains</h4>
            </CheckBox>
          </div>
          {testnetChains.map((c) => (
            <CheckBox key={c.name} checked={true} onCheck={alert} name={c.network}>
              <div className="ml-2 text-sm flex items-center">
                <span className="mr-1">{getChainDisplayName(c.id, true)}</span>
                <ChainIcon chainId={c.id} size={22} />
              </div>
            </CheckBox>
          ))}
        </div>
      </div>
    </div>
  );
}

function getChainOptionList(): Array<{ value: string; display: string }> {
  return [
    { value: '', display: 'All Chains' },
    ...mainnetAndTestChains.map((c) => ({
      value: c.id.toString(),
      display: trimToLength(c.name, 12),
    })),
  ];
}
