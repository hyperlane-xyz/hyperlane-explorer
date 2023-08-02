import BigNumber from 'bignumber.js';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { RadioButtons } from '../../../components/buttons/RadioButtons';
import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { links } from '../../../consts/links';
import FuelPump from '../../../images/icons/fuel-pump.svg';
import { Message } from '../../../types';
import { BigNumberMax, fromWei } from '../../../utils/amount';
import { toTitleCase } from '../../../utils/string';
import { GasPayment } from '../../debugger/types';
import { useMultiProvider } from '../../providers/multiProvider';
import { computeAvgGasPrice } from '../utils';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  igpPayments?: AddressTo<GasPayment[]>;
  blur: boolean;
}

export function GasDetailsCard({ message, blur, igpPayments = {} }: Props) {
  const multiProvider = useMultiProvider();
  const unitOptions = useMemo(() => {
    const originMetadata = multiProvider.tryGetChainMetadata(message.originChainId);
    const nativeCurrencyName = originMetadata?.nativeToken?.symbol || 'Eth';
    return [
      { value: 'ether', display: toTitleCase(nativeCurrencyName) },
      { value: 'gwei', display: 'Gwei' },
      { value: 'wei', display: 'Wei' },
    ];
  }, [message, multiProvider]);

  const [unit, setUnit] = useState(unitOptions[0].value);

  const { totalGasAmount, paymentFormatted, numPayments, avgPrice, paymentsWithAddr } =
    useMemo(() => {
      const paymentsWithAddr = Object.keys(igpPayments)
        .map((contract) =>
          igpPayments[contract].map((p) => ({
            gasAmount: p.gasAmount,
            paymentAmount: fromWei(p.paymentAmount, unit).toString(),
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

      const paymentFormatted = fromWei(totalPaymentWei.toString(), unit).toString();
      const avgPrice = computeAvgGasPrice(unit, totalGasAmount, totalPaymentWei);
      return { totalGasAmount, paymentFormatted, numPayments, avgPrice, paymentsWithAddr };
    }, [unit, message, igpPayments]);

  return (
    <Card className="w-full space-y-4 relative">
      <div className="flex items-center justify-between">
        <Image src={FuelPump} width={24} height={24} alt="" className="opacity-80" />
        <div className="flex items-center pb-1">
          <h3 className="text-blue-500 font-medium text-md mr-2">Interchain Gas Payments</h3>
          <HelpIcon
            size={16}
            text="Amounts paid to the Interchain Gas Paymaster for message delivery."
          />
        </div>
      </div>
      <p className="text-sm font-light">
        Interchain gas payments are required to fund message delivery on the destination chain.{' '}
        <a
          href={`${links.docs}/docs/protocol/interchain-gas-payments`}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-blue-500 hover:text-blue-400 active:text-blue-300 transition-all"
        >
          Learn more about gas on Hyperlane.
        </a>
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-4 mr-36">
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
        <div className="md:pt-2 pb-8 md:pb-6">
          <IgpPaymentsTable payments={paymentsWithAddr} />
        </div>
      )}
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

function IgpPaymentsTable({ payments }: { payments: Array<GasPayment & { contract: Address }> }) {
  return (
    <table className="rounded border-collapse overflow-hidden">
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

const style = {
  th: 'p-1 md:p-2 text-sm text-gray-500 font-normal text-left border border-gray-200 rounded',
  td: 'p-1 md:p-2 text-xs md:text-sm text-gray-700 text-left border border-gray-200 rounded',
};
