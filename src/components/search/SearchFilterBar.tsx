import clsx from 'clsx';
import { useState } from 'react';

import { ChainMetadata } from '@hyperlane-xyz/sdk';
import { trimToLength } from '@hyperlane-xyz/utils';
import { ChevronIcon, DatetimeField, Popover, XIcon, useModal } from '@hyperlane-xyz/widgets';

import { ChainSearchModal } from '../../features/chains/ChainSearchModal';
import { getChainDisplayName } from '../../features/chains/utils';
import { useMultiProvider } from '../../store';
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
  value: string | null;
  onChangeValue: (value: string | null) => void;
}) {
  const { isOpen, open, close } = useModal();

  const multiProvider = useMultiProvider();

  const chainDisplayName = value
    ? trimToLength(getChainDisplayName(multiProvider, value, true), 12)
    : undefined;

  const onClickChain = (c: ChainMetadata) => {
    onChangeValue(c.name);
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
          'flex items-center justify-center rounded border border-accent-600 px-1.5 py-1 text-sm font-medium transition-all hover:opacity-80 active:opacity-70 sm:min-w-[5.8rem] sm:px-2.5',
          value ? 'bg-accent-600 pr-7 text-white sm:pr-8' : 'text-accent-600',
        )}
        onClick={open}
      >
        <span>{chainDisplayName || text} </span>
        {!value && (
          <ChevronIcon
            direction="s"
            width={9}
            height={5}
            className="ml-2 opacity-80"
            color="#DA46CA"
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
                color="#DA46CA"
              />
            )}
          </>
        }
        buttonClassname={clsx(
          'flex items-center justify-center rounded border border-accent-600 px-2 py-1 text-sm font-medium transition-all hover:opacity-80 active:opacity-70 sm:px-3',
          hasValue ? 'bg-accent-600 pr-7 text-white sm:pr-8' : 'text-accent-600',
        )}
        panelClassname="w-60"
      >
        {({ close }) => (
          <div className="p-4" key="date-time-selector">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-primary-800">Time Range</h3>
              <div className="flex pt-1">
                <TextButton classes="text-sm font-medium text-primary-500" onClick={onClickClear}>
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
    <button
      type="button"
      onClick={onClick}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-pink-300/80 p-1 hover:opacity-80"
    >
      <XIcon color="white" height={10} width={10} />
    </button>
  );
}
