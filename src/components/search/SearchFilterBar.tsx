import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { ChainMetadata } from '@hyperlane-xyz/sdk';
import { ChainSearchMenu, Modal, Popover } from '@hyperlane-xyz/widgets';

import { useScrapedEvmChains } from '../../features/chains/queries/useScrapedChains';
import GearIcon from '../../images/icons/gear.svg';
import { useMultiProvider } from '../../store';
import { Color } from '../../styles/Color';
import { SolidButton } from '../buttons/SolidButton';
import { TextButton } from '../buttons/TextButton';
import { ChevronIcon } from '../icons/Chevron';
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
      <ChainSelector
        text="Origin"
        header="Origin Chains"
        value={originChain}
        onChangeValue={onChangeOrigin}
        position="-right-32"
      />
      <ChainSelector
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

function ChainSelector({
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
  const { chains } = useScrapedEvmChains(multiProvider);

  // const [checkedChain, setCheckedChain] = useState<ChainId|null>(value);

  const onClickChain = (c: ChainMetadata) => {
    // setCheckedChain(c.chainId);
    onChangeValue(c.chainId.toString());
  };

  const [showModal, setShowModal] = useState(false);
  const closeModal = () => {
    setShowModal(false);
  };

  return (
    <>
      <button
        type="button"
        className="text-sm sm:min-w-[5.8rem] px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded-full bg-pink-500 hover:opacity-80 active:opacity-70 transition-all"
        onClick={() => setShowModal(!showModal)}
      >
        <span className="text-white font-medium py-px">{text}</span>
        <ChevronIcon
          direction="s"
          width={9}
          height={5}
          classes="ml-2 opacity-80"
          color={Color.white}
        />
      </button>
      <Modal isOpen={showModal} close={closeModal} panelClassname="max-w-lg p-4 sm:p-5">
        <ChainSearchMenu chainMetadata={chains} onClickChain={onClickChain} />
      </Modal>
    </>
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
    <Popover
      button={
        <>
          <span className="text-white font-medium py-px px-2">Time</span>
          <ChevronIcon
            direction="s"
            width={9}
            height={5}
            classes="ml-2 opacity-80"
            color={Color.white}
          />
        </>
      }
      buttonClassname="text-sm px-1 sm:px-2.5 py-0.5 flex items-center justify-center rounded-full bg-pink-500 hover:opacity-80 active:opacity-70 transition-all"
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
          <SolidButton classes="mt-4 text-sm px-2 py-1 w-full" onClick={() => onClickApply(close)}>
            Apply
          </SolidButton>
        </div>
      )}
    </Popover>
  );
}
