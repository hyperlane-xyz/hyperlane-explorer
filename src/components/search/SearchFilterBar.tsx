import Image from 'next/future/image';
import { useState } from 'react';
import useDropdownMenu from 'react-accessible-dropdown-menu-hook';
import { Chain } from 'wagmi';

import { mainnetAndTestChains, mainnetChains, testnetChains } from '../../consts/chains';
import ArrowRightIcon from '../../images/icons/arrow-right-short.svg';
import FunnelIcon from '../../images/icons/funnel.svg';
import { getChainDisplayName } from '../../utils/chains';
import { arrayToObject } from '../../utils/objects';
import { BorderedButton } from '../buttons/BorderedButton';
import { TextButton } from '../buttons/TextButton';
import { ChainIcon } from '../icons/ChainIcon';
import { ChevronIcon } from '../icons/Chevron';
import { XIcon } from '../icons/XIcon';
import { CheckBox } from '../input/Checkbox';

interface Props {
  originChainFilter: string | null;
  onChangeOriginFilter: (value: string | null) => void;
  destinationChainFilter: string | null;
  onChangeDestinationFilter: (value: string | null) => void;
}

export function SearchFilterBar({
  originChainFilter,
  onChangeOriginFilter,
  destinationChainFilter,
  onChangeDestinationFilter,
}: Props) {
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
      <ChainMultiSelector
        text="Origin"
        header="Origin Chains"
        value={originChainFilter}
        onChangeValue={onChangeOriginFilter}
        position="-right-24"
      />
      <Image src={ArrowRightIcon} width={30} height={30} className="opacity-30" alt="" />
      <ChainMultiSelector
        text="Destination"
        header="Destination Chains"
        value={destinationChainFilter}
        onChangeValue={onChangeDestinationFilter}
      />
    </div>
  );
}

function ChainMultiSelector({
  text,
  header,
  value,
  onChangeValue,
  position,
}: {
  text: string;
  header: string;
  value: string | null; // comma separated list of checked chains
  onChangeValue: (value: string | null) => void;
  position?: string;
}) {
  const { buttonProps, isOpen, setIsOpen } = useDropdownMenu(1);
  const closeDropdown = () => {
    setIsOpen(false);
  };

  const [checkedChains, setCheckedChains] = useState(
    value ? arrayToObject(value.split(',')) : arrayToObject(mainnetAndTestChains.map((c) => c.id)),
  );

  const hasAnyUncheckedChain = (chains: Chain[]) => {
    for (const c of chains) {
      if (!checkedChains[c.id]) return true;
    }
    return false;
  };

  const onToggle = (chainId: string | number) => {
    return (checked: boolean) => {
      setCheckedChains({ ...checkedChains, [chainId]: checked });
    };
  };

  const onToggleSection = (chains: Chain[]) => {
    return () => {
      const chainIds = chains.map((c) => c.id);
      if (hasAnyUncheckedChain(chains)) {
        // If some are unchecked, check all
        setCheckedChains({ ...checkedChains, ...arrayToObject(chainIds) });
      } else {
        // If none are unchecked, uncheck all
        setCheckedChains({ ...checkedChains, ...arrayToObject(chainIds, false) });
      }
    };
  };

  const onToggleAll = () => {
    setCheckedChains(arrayToObject(mainnetAndTestChains.map((c) => c.id)));
  };

  const onToggleNone = () => {
    setCheckedChains({});
  };

  const onClickApply = () => {
    const checkedList = Object.keys(checkedChains).filter((c) => !!checkedChains[c]);
    if (checkedList.length === 0 || checkedList.length === mainnetAndTestChains.length) {
      // Use null value, indicating to filter needed
      onChangeValue(null);
    } else {
      onChangeValue(checkedList.join(','));
    }
    closeDropdown();
  };

  return (
    <div className="relative">
      <button
        className="text-sm min-w-[6rem] px-2.5 py-1 flex items-center justify-center rounded border border-gray-500 hover:opacity-70 active:opacity-60 transition-all"
        {...buttonProps}
      >
        <span>{text}</span>
        <ChevronIcon direction="s" width={10} height={6} classes="ml-2" />
      </button>

      <div
        className={`dropdown-menu w-88 ${
          position || 'right-0'
        } top-10 bg-white shadow-md drop-shadow-md xs:border-blue-50 ${!isOpen && 'hidden'}`}
        role="menu"
      >
        <div className="absolute top-1.5 right-1.5">
          <XIcon onClick={closeDropdown} />
        </div>
        <div className="py-0.5 px-1.5">
          <div className="flex items-center">
            <h3 className="text-gray-700 text-lg">{header}</h3>
            <div className="flex ml-[4.7rem]">
              <TextButton classes="text-sm underline underline-offset-2" onClick={onToggleAll}>
                All
              </TextButton>
              <TextButton
                classes="ml-3.5 text-sm underline underline-offset-2"
                onClick={onToggleNone}
              >
                None
              </TextButton>
            </div>
          </div>
          <div className="mt-2.5 flex space-x-6">
            <div className="flex flex-col space-y-1">
              <div className="pb-1.5">
                <CheckBox
                  checked={!hasAnyUncheckedChain(mainnetChains)}
                  onToggle={onToggleSection(mainnetChains)}
                  name="mainnet-chains"
                >
                  <h4 className="ml-2 text-gray-700">Mainnet Chains</h4>
                </CheckBox>
              </div>
              {mainnetChains.map((c) => (
                <CheckBox
                  key={c.name}
                  checked={!!checkedChains[c.id]}
                  onToggle={onToggle(c.id)}
                  name={c.network}
                >
                  <div className="ml-2 text-sm flex items-center">
                    <span className="mr-1">{getChainDisplayName(c.id, true)}</span>
                    <ChainIcon chainId={c.id} size={22} />
                  </div>
                </CheckBox>
              ))}
            </div>
            <div className="self-stretch w-px my-1 bg-gray-100"></div>
            <div className="flex flex-col space-y-1">
              <div className="pb-1.5">
                <CheckBox
                  checked={!hasAnyUncheckedChain(testnetChains)}
                  onToggle={onToggleSection(testnetChains)}
                  name="testnet-chains"
                >
                  <h4 className="ml-2 text-gray-700">Testnet Chains</h4>
                </CheckBox>
              </div>
              {testnetChains.map((c) => (
                <CheckBox
                  key={c.name}
                  checked={!!checkedChains[c.id]}
                  onToggle={onToggle(c.id)}
                  name={c.network}
                >
                  <div className="ml-2 text-sm flex items-center">
                    <span className="mr-1">{getChainDisplayName(c.id, true)}</span>
                    <ChainIcon chainId={c.id} size={22} />
                  </div>
                </CheckBox>
              ))}
            </div>
          </div>
          <div className="mt-2.5 flex">
            <BorderedButton classes="text-sm px-2 py-1 w-full" onClick={onClickApply}>
              Apply
            </BorderedButton>
          </div>
        </div>
      </div>
    </div>
  );
}
