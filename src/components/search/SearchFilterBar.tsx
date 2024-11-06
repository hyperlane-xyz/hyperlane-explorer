import clsx from 'clsx';
import { useState } from 'react';

import { ChainMetadata, getDomainId } from '@hyperlane-xyz/sdk';
import { trimToLength } from '@hyperlane-xyz/utils';
import {
  ChevronIcon,
  DatetimeField,
  IconButton,
  Popover,
  XIcon,
  useModal,
} from '@hyperlane-xyz/widgets';

import { ChainSearchModal } from '../../features/chains/ChainSearchModal';
import { getChainDisplayName } from '../../features/chains/utils';
import { useMultiProvider } from '../../store';
import { Color } from '../../styles/Color';
import { SolidButton } from '../buttons/SolidButton';
import { TextButton } from '../buttons/TextButton';

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
      <ChainSelector text="Origin" value={originChain} onChangeValue={onChangeOrigin} />
      <ChainSelector
        text="Destination"
        value={destinationChain}
        onChangeValue={onChangeDestination}
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

function ChainSelector({
  text,
  value,
  onChangeValue,
}: {
  text: string;
  value: ChainId | null;
  onChangeValue: (value: string | null) => void;
}) {
  const { isOpen, open, close } = useModal();

  const multiProvider = useMultiProvider();
  const chainName = value
    ? trimToLength(getChainDisplayName(multiProvider, value, true), 12)
    : undefined;

  const onClickChain = (c: ChainMetadata) => {
    onChangeValue(getDomainId(c).toString());
    close();
  };

  const onClear = () => {
    onChangeValue(null);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className={clsx(
          'flex items-center justify-center rounded-lg border border-pink-500 px-1.5 py-1 text-sm font-medium transition-all hover:opacity-80 active:opacity-70 sm:min-w-[5.8rem] sm:px-2.5',
          value ? 'bg-pink-500 pr-7 text-white sm:pr-8' : 'text-pink-500',
        )}
        onClick={open}
      >
        <span>{chainName || text} </span>
        {!value && (
          <ChevronIcon
            direction="s"
            width={9}
            height={5}
            className="ml-2 opacity-80"
            color={Color.pink}
          />
        )}
      </button>
      {value && <ClearButton onClick={onClear} />}
      <ChainSearchModal isOpen={isOpen} close={close} onClickChain={onClickChain} />
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
  // Need local state as buffer before user hits apply
  const [startTime, setStartTime] = useState<number | null>(startValue);
  const [endTime, setEndTime] = useState<number | null>(endValue);

  const onClickClear = () => {
    setStartTime(null);
    setEndTime(null);
  };

  const onClickDirectClear = () => {
    onClickClear();
    onChangeStartValue(null);
    onChangeEndValue(null);
  };

  const onClickApply = (closeDropdown?: () => void) => {
    onChangeStartValue(startTime);
    onChangeEndValue(endTime);
    if (closeDropdown) closeDropdown();
  };

  const hasValue = !!startTime || !!endTime;

  return (
    <div className="relative">
      <Popover
        button={
          <>
            <span>Time</span>
            {!hasValue && (
              <ChevronIcon
                direction="s"
                width={9}
                height={5}
                className="ml-2 opacity-80"
                color={Color.pink}
              />
            )}
          </>
        }
        buttonClassname={clsx(
          'flex items-center justify-center rounded-lg border border-pink-500 px-2 py-1 text-sm font-medium transition-all hover:opacity-80 active:opacity-70 sm:px-3',
          hasValue ? 'bg-pink-500 pr-7 text-white sm:pr-8' : 'text-pink-500',
        )}
        panelClassname="w-60"
      >
        {({ close }) => (
          <div className="p-4" key="date-time-selector">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-blue-500">Time Range</h3>
              <div className="flex pt-1">
                <TextButton classes="text-sm font-medium text-pink-500" onClick={onClickClear}>
                  Clear
                </TextButton>
              </div>
            </div>
            <div className="flex flex-col">
              <h4 className="mb-1 mt-3 text-sm font-medium text-gray-500">Start Time</h4>
              <DatetimeField timestamp={startTime} onChange={setStartTime} />
              <h4 className="mb-1 mt-3 text-sm font-medium text-gray-500">End Time</h4>
              <DatetimeField timestamp={endTime} onChange={setEndTime} />
            </div>
            <SolidButton
              classes="mt-4 text-sm px-2 py-1 w-full"
              onClick={() => onClickApply(close)}
            >
              Apply
            </SolidButton>
          </div>
        )}
      </Popover>
      {hasValue && <ClearButton onClick={onClickDirectClear} />}
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
      <IconButton onClick={onClick} className="rounded-full bg-pink-300 p-1.5">
        <XIcon color="white" height={9} width={9} />
      </IconButton>
    </div>
  );
}
