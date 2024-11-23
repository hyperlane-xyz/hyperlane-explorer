import BigNumber from 'bignumber.js';
import { utils } from 'ethers';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { fromWei, toTitleCase } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';

import { RadioButtons } from '../../../components/buttons/RadioButtons';
import { Card } from '../../../components/layout/Card';
import { docLinks } from '../../../consts/links';
import FuelPump from '../../../images/icons/fuel-pump.svg';
import { useMultiProvider } from '../../../store';
import { Message } from '../../../types';
import { BigNumberMax } from '../../../utils/big-number';
import { logger } from '../../../utils/logger';
import { GasPayment } from '../../debugger/types';

import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  igpPayments?: AddressTo<GasPayment[]>;
  blur: boolean;
}

export function GasDetailsCard({ message, blur, igpPayments = {} }: Props) {
  const multiProvider = useMultiProvider();
  const unitOptions = useMemo(() => {
    const originMetadata = multiProvider.tryGetChainMetadata(message.originDomainId);
    const nativeCurrencyName = originMetadata?.nativeToken?.symbol || 'Eth';
    const nativeDecimals = originMetadata?.nativeToken?.decimals || 18;
    return [
      { value: nativeDecimals, display: toTitleCase(nativeCurrencyName) },
      { value: 9, display: 'Gwei' },
      { value: 0, display: 'Wei' },
    ];
  }, [message, multiProvider]);

  const [decimals, setDecimals] = useState<number>(unitOptions[1].value);

  const { totalGasAmount, paymentFormatted, numPayments, avgPrice, paymentsWithAddr } =
    useMemo(() => {
      const paymentsWithAddr = Object.keys(igpPayments)
        .map((contract) =>
          igpPayments[contract].map((p) => ({
            gasAmount: p.gasAmount,
            paymentAmount: fromWei(p.paymentAmount, decimals).toString(),
            contract,
          })),
        )
        .flat();

      let totalGasAmount = paymentsWithAddr.reduce(
        (sum, val) => sum.plus(val.gasAmount),
        new BigNumber(0),
      );
      let totalPaymentWei = paymentsWithAddr.reduce(
        (sum, val) => sum.plus(val.paymentAmount),
        new BigNumber(0),
      );
      let numPayments = paymentsWithAddr.length;

      totalGasAmount = BigNumberMax(totalGasAmount, new BigNumber(message.totalGasAmount || 0));
      totalPaymentWei = BigNumberMax(totalPaymentWei, new BigNumber(message.totalPayment || 0));
      numPayments = Math.max(numPayments, message.numPayments || 0);

      const paymentFormatted = fromWei(totalPaymentWei.toString(), decimals).toString();
      const avgPrice = computeAvgGasPrice(decimals, totalGasAmount, totalPaymentWei);
      return { totalGasAmount, paymentFormatted, numPayments, avgPrice, paymentsWithAddr };
    }, [decimals, message, igpPayments]);

  return (
    <Card className="relative w-full space-y-4">
      <div className="flex items-center justify-between">
        <Image src={FuelPump} width={24} height={24} alt="" className="opacity-80" />
        <div className="flex items-center pb-1">
          <h3 className="mr-2 text-md font-medium text-blue-500">Interchain Gas Payments</h3>
          <Tooltip
            content="Amounts paid to the Interchain Gas Paymaster for message delivery."
            id="gas-info"
          />
        </div>
      </div>
      <p className="text-sm font-light">
        Interchain gas payments are required to fund message delivery on the destination chain.{' '}
        <a
          href={docLinks.gas}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-blue-500 transition-all hover:text-blue-400 active:text-blue-300"
        >
          Learn more about gas on Hyperlane.
        </a>
      </p>
      <div className="mr-36 flex flex-wrap gap-x-4 gap-y-4">
        <KeyValueRow
          label="Payment count:"
          labelWidth="w-28"
          display={numPayments.toString()}
          allowZeroish={true}
          blurValue={blur}
          classes="basis-5/12"
        />
        <KeyValueRow
          label="Total gas amount:"
          labelWidth="w-28"
          display={totalGasAmount.toString()}
          allowZeroish={true}
          blurValue={blur}
          classes="basis-5/12"
        />
        <KeyValueRow
          label="Total paid:"
          labelWidth="w-28"
          display={paymentFormatted}
          allowZeroish={true}
          blurValue={blur}
          classes="basis-5/12"
        />
        <KeyValueRow
          label="Average price:"
          labelWidth="w-28"
          display={avgPrice ? avgPrice.formatted : '-'}
          allowZeroish={true}
          blurValue={blur}
          classes="basis-5/12"
        />
      </div>
      {!!paymentsWithAddr.length && (
        <div className="pb-8 md:pb-6 md:pt-2">
          <IgpPaymentsTable payments={paymentsWithAddr} />
        </div>
      )}
      <div className="absolute bottom-2 right-2">
        <RadioButtons
          options={unitOptions}
          selected={decimals}
          onChange={(value) => setDecimals(parseInt(value.toString(), 10))}
          label="Gas unit"
        />
      </div>
    </Card>
  );
}

function IgpPaymentsTable({ payments }: { payments: Array<GasPayment & { contract: Address }> }) {
  return (
    <table className="border-collapse overflow-hidden rounded">
      <thead>
        <tr>
          <th className={style.th}>IGP Address</th>
          <th className={style.th}>Gas amount</th>
          <th className={style.th}>Payment</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p, i) => (
          <tr key={`igp-payment-${i}`}>
            <td className={style.td}>{p.contract}</td>
            <td className={style.td}>{p.gasAmount}</td>
            <td className={style.td}>{p.paymentAmount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function computeAvgGasPrice(
  decimals: number,
  gasAmount?: BigNumber.Value,
  payment?: BigNumber.Value,
) {
  try {
    if (!gasAmount || !payment) return null;
    const gasBN = new BigNumber(gasAmount);
    const paymentBN = new BigNumber(payment);
    if (gasBN.isZero() || paymentBN.isZero()) return null;
    const wei = paymentBN.div(gasBN).toFixed(0);
    const formatted = utils.formatUnits(wei, decimals).toString();
    return { wei, formatted };
  } catch (error) {
    logger.debug('Error computing avg gas price', error);
    return null;
  }
}

const style = {
  th: 'p-1 md:p-2 text-sm text-gray-500 font-normal text-left border border-gray-200 rounded',
  td: 'p-1 md:p-2 text-xs md:text-sm text-gray-700 text-left border border-gray-200 rounded',
};
