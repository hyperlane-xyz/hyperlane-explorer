import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { ChainMetadata, mainnetChainsMetadata, testnetChainsMetadata } from '@hyperlane-xyz/sdk';

import { getChainDisplayName } from '../../features/chains/utils';
import GearIcon from '../../images/icons/gear.svg';
import { arrayToObject } from '../../utils/objects';
import { BorderedButton } from '../buttons/BorderedButton';
import { TextButton } from '../buttons/TextButton';
import { ChainLogo } from '../icons/ChainLogo';
import { ChevronIcon } from '../icons/Chevron';
import { CheckBox } from '../input/Checkbox';
import { DatetimeField } from '../input/DatetimeField';
import { DropdownModal } from '../layout/Dropdown';

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
      <div className="w-px h-8 bg-gray-200"></div>
      <Link href="/settings" title="View explorer settings">
        <Image
          src={GearIcon}
          width={24}
          height={24}
          className="opacity-40 hover:opacity-30 active:opacity-20 hover:rotate-90 transition-all"
          alt=""
        />
      </Link>
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
  // Need local state as buffer before user hits apply
  const [checkedChains, setCheckedChains] = useState(
    value
      ? arrayToObject(value.split(','))
      : arrayToObject(mainnetAndTestChains.map((c) => c.chainId)),
  );

  const hasAnyUncheckedChain = (chains: ChainMetadata[]) => {
    for (const c of chains) {
      if (!checkedChains[c.chainId]) return true;
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
      const chainIds = chains.map((c) => c.chainId);
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
    setCheckedChains(arrayToObject(mainnetAndTestChains.map((c) => c.chainId)));
  };

  const onToggleNone = () => {
    setCheckedChains({});
  };

  const onClickApply = (closeDropdown?: () => void) => {
    const checkedList = Object.keys(checkedChains).filter((c) => !!checkedChains[c]);
    if (checkedList.length === 0 || checkedList.length === mainnetAndTestChains.length) {
      // Use null value, indicating to filter needed
      onChangeValue(null);
    } else {
      onChangeValue(checkedList.join(','));
    }
    if (closeDropdown) closeDropdown();
  };

  return (
    <DropdownModal
      buttonContent={
        <>
          <span className="text-gray-700 py-px">{text}</span>
          <ChevronIcon direction="s" width={9} height={5} classes="ml-2 opacity-80" />
        </>
      }
      buttonClasses="text-sm sm:min-w-[5.8rem] px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded border border-gray-500 hover:opacity-70 active:opacity-60 transition-all"
      modalContent={(closeDropdown) => (
        <div className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-700 text-lg">{header}</h3>
            <div className="flex mr-4">
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
                  checked={!!checkedChains[c.chainId]}
                  onToggle={onToggle(c.chainId)}
                  name={c.name}
                >
                  <div className="py-0.5 ml-2 text-sm flex items-center">
                    <span className="mr-2">{getChainDisplayName(c.chainId, true)}</span>
                    <ChainLogo chainId={c.chainId} size={12} color={false} background={false} />
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
                  checked={!!checkedChains[c.chainId]}
                  onToggle={onToggle(c.chainId)}
                  name={c.name}
                >
                  <div className="py-0.5 ml-2 text-sm flex items-center">
                    <span className="mr-2">{getChainDisplayName(c.chainId, true)}</span>
                    <ChainLogo chainId={c.chainId} size={12} color={false} background={false} />
                  </div>
                </CheckBox>
              ))}
            </div>
          </div>
          <BorderedButton
            classes="mt-2.5 text-sm px-2 py-1 w-full"
            onClick={() => onClickApply(closeDropdown)}
          >
            Apply
          </BorderedButton>
        </div>
      )}
      modalClasses={`w-88 ${position || 'right-0'}`}
    />
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
  // Need local state as buffer before user hits apply
  const [startTime, setStartTime] = useState<number | null>(startValue);
  const [endTime, setEndTime] = useState<number | null>(endValue);

  const onClickClear = () => {
    setStartTime(null);
    setEndTime(null);
  };

  const onClickApply = (closeDropdown?: () => void) => {
    onChangeStartValue(startTime);
    onChangeEndValue(endTime);
    if (closeDropdown) closeDropdown();
  };

  return (
    <DropdownModal
      buttonContent={
        <>
          <span className="text-gray-700 py-px px-2">Time</span>
          <ChevronIcon direction="s" width={9} height={5} classes="ml-2 opacity-80" />
        </>
      }
      buttonClasses="text-sm px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded border border-gray-500 hover:opacity-70 active:opacity-60 transition-all"
      modalContent={(closeDropdown) => (
        <div className="p-4" key="date-time-selector">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-700 text-lg">Time Range</h3>
            <div className="flex pt-1">
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
          <BorderedButton
            classes="mt-4 text-sm px-2 py-1 w-full"
            onClick={() => onClickApply(closeDropdown)}
          >
            Apply
          </BorderedButton>
        </div>
      )}
      modalClasses="w-60 -right-8"
    />
  );
}
