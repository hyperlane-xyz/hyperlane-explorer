import Image from 'next/image';
import { useState } from 'react';
import useDropdownMenu from 'react-accessible-dropdown-menu-hook';

import { ChainMetadata, mainnetChainsMetadata, testnetChainsMetadata } from '@hyperlane-xyz/sdk';
import { ChainLogo } from '@hyperlane-xyz/widgets';

import FunnelIcon from '../../images/icons/funnel.svg';
import { getChainDisplayName } from '../../utils/chains';
import { arrayToObject } from '../../utils/objects';
import { BorderedButton } from '../buttons/BorderedButton';
import { TextButton } from '../buttons/TextButton';
import { ChevronIcon } from '../icons/Chevron';
import { XIcon } from '../icons/XIcon';
import { CheckBox } from '../input/Checkbox';
import { DatetimeField } from '../input/DatetimeField';

const mainnetAndTestChains = [...mainnetChainsMetadata, ...testnetChainsMetadata];

interface Props {
  originChain: string | null;
  onChangeOrigin: (value: string | null) => void;
  destinationChain: string | null;
  onChangeDestination: (value: string | null) => void;
  startTimestamp: number | null;
  onChangeStartTimestamp: (value: number | null) => void;
  endTimestamp: number | null;
  onChangeEndTimestamp: (value: number | null) => void;
}

export function SearchFilterBar({
  originChain,
  onChangeOrigin,
  destinationChain,
  onChangeDestination,
  startTimestamp,
  onChangeStartTimestamp,
  endTimestamp,
  onChangeEndTimestamp,
}: Props) {
  return (
    <div className="flex items-center space-x-2 md:space-x-4">
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
        value={originChain}
        onChangeValue={onChangeOrigin}
        position="-right-32"
      />
      <ChainMultiSelector
        text="Destination"
        header="Destination Chains"
        value={destinationChain}
        onChangeValue={onChangeDestination}
        position="-right-28"
      />
      <DatetimeSelector
        startValue={startTimestamp}
        onChangeStartValue={onChangeStartTimestamp}
        endValue={endTimestamp}
        onChangeEndValue={onChangeEndTimestamp}
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

  // Need local state as buffer before user hits apply
  const [checkedChains, setCheckedChains] = useState(
    value ? arrayToObject(value.split(',')) : arrayToObject(mainnetAndTestChains.map((c) => c.id)),
  );

  const hasAnyUncheckedChain = (chains: ChainMetadata[]) => {
    for (const c of chains) {
      if (!checkedChains[c.id]) return true;
    }
    return false;
  };

  const onToggle = (chainId: string | number) => {
    return (checked: boolean) => {
      if (!hasAnyUncheckedChain(mainnetAndTestChains)) {
        // If none are unchecked, uncheck all except this one
        setCheckedChains({ [chainId]: true });
      } else {
        setCheckedChains({ ...checkedChains, [chainId]: checked });
      }
    };
  };

  const onToggleSection = (chains: ChainMetadata[]) => {
    return () => {
      const chainIds = chains.map((c) => c.id);
      if (hasAnyUncheckedChain(chains)) {
        // If some are unchecked, check all
        setCheckedChains({ ...checkedChains, ...arrayToObject(chainIds, true) });
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
        className="text-sm sm:min-w-[5.8rem] px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded border border-gray-500 hover:opacity-70 active:opacity-60 transition-all"
        {...buttonProps}
      >
        <span className="text-gray-700 py-px">{text}</span>
        <ChevronIcon direction="s" width={9} height={5} classes="ml-2 opacity-80" />
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
            <div className="flex flex-col">
              <div className="pb-1.5">
                <CheckBox
                  checked={!hasAnyUncheckedChain(mainnetChainsMetadata)}
                  onToggle={onToggleSection(mainnetChainsMetadata)}
                  name="mainnet-chains"
                >
                  <h4 className="ml-2 text-gray-700">Mainnet Chains</h4>
                </CheckBox>
              </div>
              {mainnetChainsMetadata.map((c) => (
                <CheckBox
                  key={c.name}
                  checked={!!checkedChains[c.id]}
                  onToggle={onToggle(c.id)}
                  name={c.name}
                >
                  <div className="py-0.5 ml-2 text-sm flex items-center">
                    <span className="mr-2">{getChainDisplayName(c.id, true)}</span>
                    <ChainLogo chainId={c.id} size={12} color={false} background={false} />
                  </div>
                </CheckBox>
              ))}
            </div>
            <div className="self-stretch w-px my-1 bg-gray-100"></div>
            <div className="flex flex-col">
              <div className="pb-1.5">
                <CheckBox
                  checked={!hasAnyUncheckedChain(testnetChainsMetadata)}
                  onToggle={onToggleSection(testnetChainsMetadata)}
                  name="testnet-chains"
                >
                  <h4 className="ml-2 text-gray-700">Testnet Chains</h4>
                </CheckBox>
              </div>
              {testnetChainsMetadata.map((c) => (
                <CheckBox
                  key={c.name}
                  checked={!!checkedChains[c.id]}
                  onToggle={onToggle(c.id)}
                  name={c.name}
                >
                  <div className="py-0.5 ml-2 text-sm flex items-center">
                    <span className="mr-2">{getChainDisplayName(c.id, true)}</span>
                    <ChainLogo chainId={c.id} size={12} color={false} background={false} />
                  </div>
                </CheckBox>
              ))}
            </div>
          </div>
          <BorderedButton classes="mt-2.5 text-sm px-2 py-1 w-full" onClick={onClickApply}>
            Apply
          </BorderedButton>
        </div>
      </div>
    </div>
  );
}

function DatetimeSelector({
  startValue,
  onChangeStartValue,
  endValue,
  onChangeEndValue,
}: {
  startValue: number | null;
  onChangeStartValue: (value: number | null) => void;
  endValue: number | null;
  onChangeEndValue: (value: number | null) => void;
}) {
  const { buttonProps, isOpen, setIsOpen } = useDropdownMenu(1);
  const closeDropdown = () => {
    setIsOpen(false);
  };

  // Need local state as buffer before user hits apply
  const [startTime, setStartTime] = useState<number | null>(startValue);
  const [endTime, setEndTime] = useState<number | null>(endValue);

  const onClickClear = () => {
    setStartTime(null);
    setEndTime(null);
  };

  const onClickApply = () => {
    onChangeStartValue(startTime);
    onChangeEndValue(endTime);
    closeDropdown();
  };

  return (
    <div className="relative">
      <button
        className="text-sm px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded border border-gray-500 hover:opacity-70 active:opacity-60 transition-all"
        {...buttonProps}
      >
        <span className="text-gray-700 py-px px-2">Time</span>
        <ChevronIcon direction="s" width={9} height={5} classes="ml-2 opacity-80" />
      </button>

      <div
        className={`dropdown-menu w-60 top-10 right-0 bg-white shadow-md drop-shadow-md xs:border-blue-50 ${
          !isOpen && 'hidden'
        }`}
        role="menu"
      >
        <div className="absolute top-1.5 right-1.5">
          <XIcon onClick={closeDropdown} />
        </div>
        <div className="py-0.5 px-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-700 text-lg">Time Range</h3>
            <div className="flex mr-6 pt-1">
              <TextButton classes="text-sm underline underline-offset-2" onClick={onClickClear}>
                Clear
              </TextButton>
            </div>
          </div>
          <div className="flex flex-col">
            <h4 className="mt-3 mb-1 text-gray-700">Start Time</h4>
            <DatetimeField timestamp={startTime} onChange={setStartTime} />
            <h4 className="mt-3 mb-1 text-gray-700">End Time</h4>
            <DatetimeField timestamp={endTime} onChange={setEndTime} />
          </div>
          <BorderedButton classes="mt-4 text-sm px-2 py-1 w-full" onClick={onClickApply}>
            Apply
          </BorderedButton>
        </div>
      </div>
    </div>
  );
}
