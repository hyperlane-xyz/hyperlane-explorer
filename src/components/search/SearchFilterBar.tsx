import clsx from 'clsx';
import { useState } from 'react';

import { ChainMetadata, getDomainId } from '@hyperlane-xyz/sdk';
import { trimToLength } from '@hyperlane-xyz/utils';
import {
  ChainSearchMenu,
  ChevronIcon,
  IconButton,
  Modal,
  Popover,
  XIcon,
} from '@hyperlane-xyz/widgets';

import { useScrapedChains } from '../../features/chains/queries/useScrapedChains';
import { getChainDisplayName } from '../../features/chains/utils';
import { useMultiProvider, useStore } from '../../store';
import { Color } from '../../styles/Color';
import { SolidButton } from '../buttons/SolidButton';
import { TextButton } from '../buttons/TextButton';
import { DatetimeField } from '../input/DatetimeField';

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
  const multiProvider = useMultiProvider();
  const { chains } = useScrapedChains(multiProvider);
  const { chainMetadataOverrides, setChainMetadataOverrides } = useStore((s) => ({
    chainMetadataOverrides: s.chainMetadataOverrides,
    setChainMetadataOverrides: s.setChainMetadataOverrides,
  }));

  const [showModal, setShowModal] = useState(false);
  const closeModal = () => {
    setShowModal(false);
  };

  const onClickChain = (c: ChainMetadata) => {
    onChangeValue(getDomainId(c).toString());
    closeModal();
  };

  const onClear = () => {
    onChangeValue(null);
  };

  const chainName = value
    ? trimToLength(getChainDisplayName(multiProvider, value, true), 12)
    : undefined;

  return (
    <div className="relative">
      <button
        type="button"
        className={clsx(
          'text-sm sm:min-w-[5.8rem] px-1.5 sm:px-2.5 py-1 flex items-center justify-center font-medium rounded-lg border border-pink-500 hover:opacity-80 active:opacity-70 transition-all',
          value ? 'bg-pink-500 text-white pr-7 sm:pr-8' : 'text-pink-500',
        )}
        onClick={() => setShowModal(!showModal)}
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
      <Modal
        isOpen={showModal}
        close={closeModal}
        panelClassname="p-4 sm:p-5 max-w-lg min-h-[40vh]"
      >
        <ChainSearchMenu
          chainMetadata={chains}
          onClickChain={onClickChain}
          overrideChainMetadata={chainMetadataOverrides}
          onChangeOverrideMetadata={setChainMetadataOverrides}
          showAddChainButton={true}
        />
      </Modal>
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
          'text-sm px-2 sm:px-3 py-1 flex items-center justify-center font-medium border border-pink-500 rounded-lg hover:opacity-80 active:opacity-70 transition-all',
          hasValue ? ' bg-pink-500 text-white pr-7 sm:pr-8' : 'text-pink-500',
        )}
        panelClassname="w-60"
      >
        {({ close }) => (
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
      <IconButton onClick={onClick} className="bg-pink-300 p-1.5 rounded-full">
        <XIcon color="white" height={9} width={9} />
      </IconButton>
    </div>
  );
}
