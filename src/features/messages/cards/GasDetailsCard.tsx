import { BigNumberMax, fromWei, isNullish } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import BigNumber from 'bignumber.js';
import { useMemo } from 'react';

import { SectionCard } from '../../../components/layout/SectionCard';
import { docLinks } from '../../../consts/links';
import { useChainMetadataResolver } from '../../../metadataStore';
import { Message, MessageStub } from '../../../types';
import { GasPayment } from '../../debugger/types';
import { IgpPaymentsStatus } from '../igpPayments';
import {
  formatOtherPayments,
  formatRawUnits,
  formatUsd,
  getOtherPayments,
  hasNonNativePayments,
  NATIVE_ASSET_ID,
  PaymentAsset,
  summarizePayments,
  sumPayments,
} from './gasPaymentSummary';
import { KeyValueRow } from './KeyValueRow';
import { useIgpPayments } from './useIgpPayments';
import { useNativeTokenUsdPrice, useTokenUsdPrices } from './useNativeTokenUsdPrice';

interface Props {
  message: Message | MessageStub;
  igpPayments?: AddressTo<GasPayment[]>;
  blur: boolean;
}

export function GasDetailsCard({ message, blur, igpPayments = {} }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();
  const nativeUsdPrice = useNativeTokenUsdPrice(message.originDomainId, message.origin?.timestamp);
  const deliveryTx = message.destination;
  const deliveryGasUsed = deliveryTx && 'gasUsed' in deliveryTx ? deliveryTx.gasUsed : undefined;
  const deliveryEffectiveGasPrice =
    deliveryTx && 'effectiveGasPrice' in deliveryTx ? deliveryTx.effectiveGasPrice : undefined;
  const destUsdPrice = useNativeTokenUsdPrice(message.destinationDomainId, deliveryTx?.timestamp);
  const totalGasAmountFromMessage =
    'totalGasAmount' in message ? message.totalGasAmount : undefined;
  const totalPaymentFromMessage = 'totalPayment' in message ? message.totalPayment : undefined;
  const numPaymentsFromMessage = 'numPayments' in message ? message.numPayments : undefined;
  const originMetadata = chainMetadataResolver.tryGetChainMetadata(message.originDomainId);
  const nativeDecimals = originMetadata?.nativeToken?.decimals || 18;
  const nativeSymbol = originMetadata?.nativeToken?.symbol || 'ETH';
  const nativeAsset: PaymentAsset = {
    id: NATIVE_ASSET_ID,
    symbol: nativeSymbol,
    decimals: nativeDecimals,
    coinGeckoId: originMetadata?.gasCurrencyCoinGeckoId,
  };
  const {
    status: receiptStatus,
    payments: receiptPayments,
    tokenMetadata,
  } = useIgpPayments(message, !blur);
  const hasTokenPayments = receiptPayments ? hasNonNativePayments(receiptPayments) : false;
  const tokenUsdPrices = useTokenUsdPrices(
    hasTokenPayments ? Object.values(tokenMetadata).flatMap((m) => m.coinGeckoId ?? []) : [],
    !!originMetadata?.isTestnet,
    message.origin?.timestamp,
  );
  const destMetadata = chainMetadataResolver.tryGetChainMetadata(message.destinationDomainId);
  const destDecimals = destMetadata?.nativeToken?.decimals || 18;
  const destSymbol = destMetadata?.nativeToken?.symbol || 'ETH';

  const { totalGasAmount, paymentFormatted, totalPaymentWei, numPayments, paymentsWithAddr } =
    useMemo(() => {
      const paymentsWithAddr = Object.keys(igpPayments)
        .map((contract) =>
          igpPayments[contract].map((p) => ({
            gasAmount: p.gasAmount,
            paymentAmount: fromWei(p.paymentAmount, nativeDecimals).toString(),
            paymentAmountWei: p.paymentAmount,
            contract,
          })),
        )
        .flat();

      let totalGasAmount = paymentsWithAddr.reduce(
        (sum, val) => sum.plus(val.gasAmount),
        new BigNumber(0),
      );
      let totalPaymentWei = paymentsWithAddr.reduce(
        (sum, val) => sum.plus(val.paymentAmountWei),
        new BigNumber(0),
      );
      let numPayments = paymentsWithAddr.length;

      totalGasAmount = new BigNumber(
        BigNumberMax(totalGasAmount, new BigNumber(totalGasAmountFromMessage || 0)),
      );
      totalPaymentWei = new BigNumber(
        BigNumberMax(totalPaymentWei, new BigNumber(totalPaymentFromMessage || 0)),
      );
      numPayments = Math.max(numPayments, numPaymentsFromMessage || 0);

      if (receiptPayments) {
        totalGasAmount = new BigNumber(
          BigNumberMax(totalGasAmount, sumPayments(receiptPayments, 'gasAmount')),
        );
        totalPaymentWei = new BigNumber(
          BigNumberMax(totalPaymentWei, sumPayments(receiptPayments, 'paymentAmount')),
        );
        numPayments = Math.max(numPayments, receiptPayments.length);
      }

      const paymentFormatted = fromWei(totalPaymentWei.toString(), nativeDecimals).toString();
      return { totalGasAmount, paymentFormatted, totalPaymentWei, numPayments, paymentsWithAddr };
    }, [
      nativeDecimals,
      igpPayments,
      receiptPayments,
      numPaymentsFromMessage,
      totalGasAmountFromMessage,
      totalPaymentFromMessage,
    ]);

  const paymentUsdFormatted = !isNullish(nativeUsdPrice)
    ? formatUsd(
        new BigNumber(fromWei(totalPaymentWei.toString(), nativeDecimals)).times(nativeUsdPrice),
      )
    : null;

  const receiptTotals = receiptPayments
    ? summarizePayments(receiptPayments, nativeAsset, tokenMetadata, (asset) =>
        asset.id === NATIVE_ASSET_ID
          ? nativeUsdPrice
          : asset.coinGeckoId
            ? tokenUsdPrices[asset.coinGeckoId]
            : null,
      )
    : undefined;
  const otherPayments = receiptPayments
    ? getOtherPayments(numPayments, totalPaymentWei, receiptPayments)
    : undefined;
  // One width for all the rows of the receipt, so their values line up
  const receiptLabelWidth = receiptTotals && receiptTotals.length > 1 ? 'w-52' : 'w-36';
  const isDenominationUnresolved =
    receiptStatus === IgpPaymentsStatus.Pending || receiptStatus === IgpPaymentsStatus.Error;

  const deliveryCostWei =
    !isNullish(deliveryGasUsed) && !isNullish(deliveryEffectiveGasPrice)
      ? new BigNumber(deliveryGasUsed).times(deliveryEffectiveGasPrice)
      : null;
  const deliveryCostFormatted = !isNullish(deliveryCostWei)
    ? fromWei(deliveryCostWei.toString(), destDecimals).toString()
    : null;
  const deliveryCostUsdFormatted =
    !isNullish(deliveryCostWei) && !isNullish(destUsdPrice)
      ? formatUsd(
          new BigNumber(fromWei(deliveryCostWei.toString(), destDecimals)).times(destUsdPrice),
        )
      : null;

  return (
    <SectionCard
      className="w-full"
      title="Interchain Gas Payments"
      icon={
        <Tooltip
          content="Amounts paid to the Interchain Gas Paymaster for message delivery."
          id="gas-info"
        />
      }
    >
      <div className="space-y-3">
        <p className="text-xs font-light">
          Interchain gas payments are required to fund message delivery on the destination chain.{' '}
          <a
            href={docLinks.gas}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-800 hover:text-primary-700 active:text-primary-600 cursor-pointer transition-all"
          >
            Learn more about gas on Hyperlane.
          </a>
        </p>
        <div className="flex flex-col gap-y-2 sm:flex-row sm:gap-x-6 sm:gap-y-0">
          <div className="flex flex-1 flex-col gap-y-2">
            <KeyValueRow
              label="Payment count:"
              labelWidth="w-36"
              display={numPayments.toString()}
              allowZeroish={true}
              blurValue={blur}
            />
            <KeyValueRow
              label="Total gas amount:"
              labelWidth="w-36"
              display={totalGasAmount.toString()}
              allowZeroish={true}
              blurValue={blur}
            />
          </div>
          <div className="flex flex-1 flex-col gap-y-2">
            {receiptStatus === IgpPaymentsStatus.Pending && (
              <KeyValueRow
                label="Total paid:"
                labelWidth="w-24"
                display="Loading..."
                allowZeroish={true}
                blurValue={blur}
              />
            )}
            {receiptStatus === IgpPaymentsStatus.Error && (
              <KeyValueRow
                label="Total paid:"
                labelWidth="w-24"
                display={formatRawUnits(totalPaymentWei.toFixed())}
                subDisplay="(unit unverified)"
                allowZeroish={true}
                blurValue={blur}
              />
            )}
            {!isDenominationUnresolved &&
              (receiptTotals ? (
                <>
                  {!receiptTotals.length && (
                    <KeyValueRow
                      label="Paid at dispatch:"
                      labelWidth={receiptLabelWidth}
                      display="None"
                      allowZeroish={true}
                      blurValue={blur}
                    />
                  )}
                  {receiptTotals.map((total) => (
                    <KeyValueRow
                      key={total.id}
                      label={total.label}
                      labelWidth={receiptLabelWidth}
                      display={total.display}
                      subDisplay={total.usd ? `(${total.usd})` : undefined}
                      allowZeroish={true}
                      blurValue={blur}
                    />
                  ))}
                </>
              ) : (
                <KeyValueRow
                  label="Total paid:"
                  labelWidth="w-24"
                  display={`${paymentFormatted} ${nativeSymbol}`}
                  subDisplay={paymentUsdFormatted ? `(${paymentUsdFormatted})` : undefined}
                  allowZeroish={true}
                  blurValue={blur}
                />
              ))}
            {otherPayments && (
              <KeyValueRow
                label="Other payments:"
                labelWidth={receiptLabelWidth}
                display={formatOtherPayments(otherPayments)}
                allowZeroish={true}
                blurValue={blur}
              />
            )}
          </div>
        </div>
        {!isNullish(deliveryGasUsed) && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="mb-2 text-sm text-gray-500">Destination delivery</h4>
            <div className="flex flex-col gap-y-2 sm:flex-row sm:gap-x-6 sm:gap-y-0">
              <div className="flex flex-1 flex-col gap-y-2">
                <KeyValueRow
                  label="Gas used:"
                  labelWidth="w-36"
                  display={deliveryGasUsed.toString()}
                  allowZeroish={true}
                  blurValue={blur}
                />
              </div>
              <div className="flex flex-1 flex-col gap-y-2">
                {!isNullish(deliveryCostFormatted) && (
                  <KeyValueRow
                    label="Gas cost:"
                    labelWidth="w-24"
                    display={`${deliveryCostFormatted} ${destSymbol}`}
                    subDisplay={
                      deliveryCostUsdFormatted ? `(${deliveryCostUsdFormatted})` : undefined
                    }
                    allowZeroish={true}
                    blurValue={blur}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        {!hasTokenPayments &&
          !otherPayments &&
          !isDenominationUnresolved &&
          !!paymentsWithAddr.length && (
            <div className="md:pt-2">
              <IgpPaymentsTable
                payments={paymentsWithAddr}
                nativeUsdPrice={nativeUsdPrice}
                nativeDecimals={nativeDecimals}
                nativeSymbol={nativeSymbol}
              />
            </div>
          )}
      </div>
    </SectionCard>
  );
}

function IgpPaymentsTable({
  payments,
  nativeUsdPrice,
  nativeDecimals,
  nativeSymbol,
}: {
  payments: Array<GasPayment & { contract: Address; paymentAmountWei: string }>;
  nativeUsdPrice: number | null;
  nativeDecimals: number;
  nativeSymbol: string;
}) {
  const showUsd = !isNullish(nativeUsdPrice);
  return (
    <table className="border-collapse overflow-hidden rounded">
      <thead>
        <tr>
          <th className={style.th}>IGP Address</th>
          <th className={style.th}>Gas amount</th>
          <th className={style.th}>Payment ({nativeSymbol})</th>
          {showUsd && <th className={style.th}>Payment (USD)</th>}
        </tr>
      </thead>
      <tbody>
        {payments.map((p, i) => (
          <tr key={`igp-payment-${i}`}>
            <td className={style.td}>{p.contract}</td>
            <td className={style.td}>{p.gasAmount}</td>
            <td className={style.td}>{p.paymentAmount}</td>
            {showUsd && (
              <td className={style.td}>
                {formatUsd(
                  new BigNumber(fromWei(p.paymentAmountWei, nativeDecimals)).times(nativeUsdPrice),
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const style = {
  th: 'p-1 md:p-1.5 text-xs text-gray-500 font-normal text-left border border-gray-200 rounded',
  td: 'p-1 md:p-1.5 font-mono text-xxs md:text-xs text-gray-700 text-left border border-gray-200 rounded',
};
