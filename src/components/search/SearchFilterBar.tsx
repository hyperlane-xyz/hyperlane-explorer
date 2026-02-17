import clsx from 'clsx';
import { useState } from 'react';

import { ChainMetadata } from '@hyperlane-xyz/sdk';
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
import { MessageStatusFilter } from '../../types';
import { SolidButton } from '../buttons/SolidButton';
import { TextButton } from '../buttons/TextButton';
import { SafeTextMorph } from '../SafeTextMorph';

interface Props {
  originChain: string | null;
  onChangeOrigin: (value: string | null) => void;
  destinationChain: string | null;
  onChangeDestination: (value: string | null) => void;
  startTimestamp: number | null;
  onChangeStartTimestamp: (value: number | null) => void;
  endTimestamp: number | null;
  onChangeEndTimestamp: (value: number | null) => void;
  statusFilter: MessageStatusFilter;
  onChangeStatus: (value: MessageStatusFilter) => void;
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
  statusFilter,
  onChangeStatus,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-4">
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
      <StatusSelector value={statusFilter} onChangeValue={onChangeStatus} />
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
          'flex items-center justify-center rounded-lg border border-pink-500 px-1.5 py-1 text-sm font-medium transition-all hover:opacity-80 active:opacity-70 sm:min-w-[5.8rem] sm:px-2.5',
          value ? 'bg-pink-500 pr-7 text-white sm:pr-8' : 'text-pink-500',
        )}
        onClick={open}
      >
        <SafeTextMorph as="span">{chainDisplayName || text}</SafeTextMorph>
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

const STATUS_OPTIONS: { value: MessageStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'pending', label: 'Pending' },
];

function StatusSelector({
  value,
  onChangeValue,
}: {
  value: MessageStatusFilter;
  onChangeValue: (value: MessageStatusFilter) => void;
}) {
  const currentLabel = STATUS_OPTIONS.find((opt) => opt.value === value)?.label || 'All';
  const hasValue = value !== 'all';

  return (
    <div className="relative">
      <Popover
        button={
          <>
            {hasValue ? (
              <SafeTextMorph as="span">{currentLabel}</SafeTextMorph>
            ) : (
              <span>Status</span>
            )}
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
        panelClassname="w-36"
      >
        {({ close }) => (
          <div className="p-2" key="status-selector">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={clsx(
                  'w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100',
                  value === option.value && 'bg-pink-50 font-medium text-pink-500',
                )}
                onClick={() => {
                  onChangeValue(option.value);
                  close();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </Popover>
      {hasValue && <ClearButton onClick={() => onChangeValue('all')} />}
    </div>
  );
}
