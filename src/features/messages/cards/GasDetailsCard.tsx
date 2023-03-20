import BigNumber from 'bignumber.js';
import { utils } from 'ethers';
import Image from 'next/image';
import { useState } from 'react';

import { RadioButtons } from '../../../components/buttons/RadioButtons';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { links } from '../../../consts/links';
import FuelPump from '../../../images/icons/fuel-pump.svg';
import { Message } from '../../../types';
import { fromWei } from '../../../utils/amount';
import { logger } from '../../../utils/logger';

import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  shouldBlur: boolean;
}

const unitOptions = [
  { value: 'ether', display: 'Eth' },
  { value: 'gwei', display: 'Gwei' },
  { value: 'wei', display: 'Wei' },
];

export function GasDetailsCard({ message, shouldBlur }: Props) {
  const [unit, setUnit] = useState(unitOptions[0].value);

  const { totalGasAmount, totalPayment: totalPaymentWei } = message;
  const paymentFormatted = fromWei(totalPaymentWei, unit).toString();
  const avgPrice = computeAvgGasPrice(unit, totalGasAmount, totalPaymentWei);

  return (
    <Card classes="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Image src={FuelPump} width={24} height={24} alt="" className="opacity-70" />
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">Interchain Gas Payments</h3>
          <HelpIcon
            size={16}
            text="Amounts paid to the Interchain Gas Paymaster for message delivery."
          />
        </div>
      </div>
      <p className="text-sm">
        Interchain gas payments are required to fund message delivery on the destination chain.{' '}
        <a
          href={`${links.docs}/docs/build-with-hyperlane/guides/paying-for-interchain-gas`}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-blue-500 hover:text-blue-400 active:text-blue-300 transition-all"
        >
          Learn more about gas on Hyperlane.
        </a>
      </p>
      <div className="flex flex-wrap gap-x-16 gap-y-4 mr-32">
        <KeyValueRow
          label="Total payments:"
          labelWidth="w-28"
          display={totalPaymentWei ? paymentFormatted : '0'}
          blurValue={shouldBlur}
        />
        <KeyValueRow
          label="Total gas amount:"
          labelWidth="w-28"
          display={totalGasAmount?.toString() || '0'}
          blurValue={shouldBlur}
        />
        <KeyValueRow
          label="Average price:"
          labelWidth="w-28"
          display={avgPrice ? avgPrice.formatted : '-'}
          blurValue={shouldBlur}
        />
      </div>
      <div className="absolute right-2 bottom-2">
        <RadioButtons
          options={unitOptions}
          selected={unit}
          onChange={(value) => setUnit(value)}
          label="Gas unit"
        />
      </div>
    </Card>
  );
}

function computeAvgGasPrice(unit: string, gasAmount?: number, payment?: number) {
  try {
    if (!gasAmount || !payment) return null;
    const paymentBN = new BigNumber(payment);
    const wei = paymentBN.div(gasAmount).toFixed(0);
    const formatted = utils.formatUnits(wei, unit).toString();
    return { wei, formatted };
  } catch (error) {
    logger.debug('Error computing avg gas price', error);
    return null;
  }
}
