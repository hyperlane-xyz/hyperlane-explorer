import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ChainMetadata } from '@hyperlane-xyz/sdk';
import { arrayToObject } from '@hyperlane-xyz/utils';

import { getChainDisplayName, isEvmChain, isPiChain } from '../../features/chains/utils';
import GearIcon from '../../images/icons/gear.svg';
import { useMultiProvider } from '../../store';
import { Color } from '../../styles/Color';
import { SolidButton } from '../buttons/SolidButton';
import { TextButton } from '../buttons/TextButton';
import { ChainLogo } from '../icons/ChainLogo';
import { ChevronIcon } from '../icons/Chevron';
import { CheckBox } from '../input/Checkbox';
import { DatetimeField } from '../input/DatetimeField';
import { DropdownModal } from '../layout/Dropdown';

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
      <Link href="/settings" title="View explorer settings">
        <div className="p-1.5 bg-pink-500 rounded-full active:opacity-90 hover:rotate-90 transition-all">
          <Image src={GearIcon} width={16} height={16} className="invert" alt="Settings" />
        </div>
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
  const multiProvider = useMultiProvider();
  const { chains, mainnets, testnets } = useMemo(() => {
    const chains = Object.values(multiProvider.metadata);
    // Filtering to EVM is necessary to prevent errors until cosmos support is added
    // https://github.com/hyperlane-xyz/hyperlane-explorer/issues/61
    const coreEvmChains = chains.filter(
      (c) => isEvmChain(multiProvider, c.chainId) && !isPiChain(multiProvider, c.chainId),
    );
    const mainnets = coreEvmChains.filter((c) => !c.isTestnet);
    const testnets = coreEvmChains.filter((c) => !!c.isTestnet);
    // Return only evnChains because of graphql only accept query non-evm chains (with bigint type not string)
    return { chains: coreEvmChains, mainnets, testnets };
  }, [multiProvider]);

  // Need local state as buffer before user hits apply
  const [checkedChains, setCheckedChains] = useState(
    value
      ? arrayToObject(value.split(','))
      : arrayToObject(chains.map((c) => c.chainId.toString())),
  );

  const hasAnyUncheckedChain = (chains: ChainMetadata[]) => {
    for (const c of chains) {
      if (!checkedChains[c.chainId]) return true;
    }
    return false;
  };

  const onToggle = (chainId: string | number) => {
    return (checked: boolean) => {
      if (!hasAnyUncheckedChain(chains)) {
        // If none are unchecked, uncheck all except this one
        setCheckedChains({ [chainId]: true });
      } else {
        setCheckedChains({ ...checkedChains, [chainId]: checked });
      }
    };
  };

  const onToggleSection = (chains: ChainMetadata[]) => {
    return () => {
      const chainIds = chains.map((c) => c.chainId.toString());
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
    setCheckedChains(arrayToObject(chains.map((c) => c.chainId.toString())));
  };

  const onToggleNone = () => {
    setCheckedChains({});
  };

  const onClickApply = (closeDropdown?: () => void) => {
    const checkedList = Object.keys(checkedChains).filter((c) => !!checkedChains[c]);
    if (checkedList.length === 0 || checkedList.length === chains.length) {
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
          <span className="text-white font-medium py-px">{text}</span>
          <ChevronIcon
            direction="s"
            width={9}
            height={5}
            classes="ml-2 opacity-80"
            color={Color.White}
          />
        </>
      }
      buttonClasses="text-sm sm:min-w-[5.8rem] px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded-full bg-pink-500 hover:opacity-80 active:opacity-70 transition-all"
      modalContent={(closeDropdown) => (
        <div className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-blue-500">{header}</h3>
            <div className="flex mr-4">
              <TextButton classes="text-sm font-medium text-pink-500" onClick={onToggleAll}>
                All
              </TextButton>
              <TextButton classes="ml-3.5 text-sm font-medium text-pink-500" onClick={onToggleNone}>
                None
              </TextButton>
            </div>
          </div>
          <div className="mt-2.5 flex space-x-6">
            <div className="flex flex-col">
              <div className="pb-1.5">
                <CheckBox
                  checked={!hasAnyUncheckedChain(mainnets)}
                  onToggle={onToggleSection(mainnets)}
                  name="mainnet-chains"
                >
                  <h4 className="ml-2 text-gray-800">Mainnet Chains</h4>
                </CheckBox>
              </div>
              {mainnets.map((c) => (
                <CheckBox
                  key={c.name}
                  checked={!!checkedChains[c.chainId]}
                  onToggle={onToggle(c.chainId)}
                  name={c.name}
                >
                  <div className="py-0.5 ml-2 text-sm flex items-center">
                    <span className="mr-2 font-light">
                      {getChainDisplayName(multiProvider, c.chainId, true)}
                    </span>
                    <ChainLogo chainId={c.chainId} size={12} background={false} />
                  </div>
                </CheckBox>
              ))}
            </div>
            <div className="self-stretch w-px my-1 bg-gray-100"></div>
            <div className="flex flex-col">
              <div className="pb-1.5">
                <CheckBox
                  checked={!hasAnyUncheckedChain(testnets)}
                  onToggle={onToggleSection(testnets)}
                  name="testnet-chains"
                >
                  <h4 className="ml-2 text-gray-800">Testnet Chains</h4>
                </CheckBox>
              </div>
              {testnets.map((c) => (
                <CheckBox
                  key={c.name}
                  checked={!!checkedChains[c.chainId]}
                  onToggle={onToggle(c.chainId)}
                  name={c.name}
                >
                  <div className="py-0.5 ml-2 text-sm flex items-center">
                    <span className="mr-2 font-light">
                      {getChainDisplayName(multiProvider, c.chainId, true)}
                    </span>
                    <ChainLogo chainId={c.chainId} size={12} background={false} />
                  </div>
                </CheckBox>
              ))}
            </div>
          </div>
          <SolidButton
            classes="mt-2.5 text-sm px-2 py-1 w-full"
            onClick={() => onClickApply(closeDropdown)}
          >
            Apply
          </SolidButton>
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
          <span className="text-white font-medium py-px px-2">Time</span>
          <ChevronIcon
            direction="s"
            width={9}
            height={5}
            classes="ml-2 opacity-80"
            color={Color.White}
          />
        </>
      }
      buttonClasses="text-sm px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded-full bg-pink-500 hover:opacity-80 active:opacity-70 transition-all"
      modalContent={(closeDropdown) => (
        <div className="p-4" key="date-time-selector">
          <div className="flex items-center justify-between">
            <h3 className="text-blue-500 font-medium">Time Range</h3>
            <div className="flex pt-1">
              <TextButton classes="text-sm font-medium text-pink-500" onClick={onClickClear}>
                Clear
              </TextButton>
            </div>
          </div>
          <div className="flex flex-col">
            <h4 className="mt-3 mb-1 text-gray-500 text-sm font-medium">Start Time</h4>
            <DatetimeField timestamp={startTime} onChange={setStartTime} />
            <h4 className="mt-3 mb-1 text-gray-500 text-sm font-medium">End Time</h4>
            <DatetimeField timestamp={endTime} onChange={setEndTime} />
          </div>
          <SolidButton
            classes="mt-4 text-sm px-2 py-1 w-full"
            onClick={() => onClickApply(closeDropdown)}
          >
            Apply
          </SolidButton>
        </div>
      )}
      modalClasses="w-60 -right-8"
    />
  );
}