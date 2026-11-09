import { BigNumberMax, fromWei, isNullish } from '@hyperlane-xyz/utils';
import BigNumber from 'bignumber.js';
import { useMemo } from 'react';

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

export function OriginGasPaymentDetails({ message, blur, igpPayments = {} }: Props) {
  const chainMetadataResolver = useChainMetadataResolver();
  const nativeUsdPrice = useNativeTokenUsdPrice(message.originDomainId, message.origin?.timestamp);
  const totalGasAmountFromMessage =
    'totalGasAmount' in message ? message.totalGasAmount : undefined;
  const totalPaymentFromMessage = 'totalPayment' in message ? message.totalPayment : undefined;
  const numPaymentsFromMessage = 'numPayments' in message ? message.numPayments : undefined;
  const originMetadata = chainMetadataResolver.tryGetChainMetadata(message.originDomainId);
  const nativeDecimals = originMetadata?.nativeToken?.decimals;
  const nativeSymbol = originMetadata?.nativeToken?.symbol ?? 'native token';
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
  const { totalGasAmount, totalPaymentWei, numPayments, paymentsWithAddr } = useMemo(() => {
    const paymentsWithAddr = Object.keys(igpPayments)
      .map((contract) =>
        igpPayments[contract].map((p) => ({
          gasAmount: p.gasAmount,
          paymentAmount:
            nativeDecimals === undefined
              ? p.paymentAmount
              : fromWei(p.paymentAmount, nativeDecimals).toString(),
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
      BigNumberMax(totalGasAmount, new BigNumber(totalGasAmountFromMessage ?? 0)),
    );
    totalPaymentWei = new BigNumber(
      BigNumberMax(totalPaymentWei, new BigNumber(totalPaymentFromMessage ?? 0)),
    );
    numPayments = Math.max(numPayments, numPaymentsFromMessage ?? 0);

    if (receiptPayments) {
      totalGasAmount = new BigNumber(
        BigNumberMax(totalGasAmount, sumPayments(receiptPayments, 'gasAmount')),
      );
      totalPaymentWei = new BigNumber(
        BigNumberMax(totalPaymentWei, sumPayments(receiptPayments, 'paymentAmount')),
      );
      numPayments = Math.max(numPayments, receiptPayments.length);
    }

    return { totalGasAmount, totalPaymentWei, numPayments, paymentsWithAddr };
  }, [
    nativeDecimals,
    igpPayments,
    receiptPayments,
    numPaymentsFromMessage,
    totalGasAmountFromMessage,
    totalPaymentFromMessage,
  ]);

  const hasPaymentRecords = receiptPayments !== undefined || paymentsWithAddr.length > 0;
  const hasPaymentCount = hasPaymentRecords || !isNullish(numPaymentsFromMessage);
  const hasGasAmount = hasPaymentRecords || !isNullish(totalGasAmountFromMessage);
  const hasPaymentAmount = hasPaymentRecords || !isNullish(totalPaymentFromMessage);

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
  const isDenominationUnresolved = receiptStatus !== IgpPaymentsStatus.Ready;

  return (
    <div className="min-w-0 space-y-3 border-t border-gray-200 pt-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-medium text-gray-600">Delivery funding · IGP</h4>
        <a
          href={docLinks.gas}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary-700 underline decoration-primary-200 underline-offset-2 hover:text-primary-900"
        >
          How funding works
        </a>
      </header>
      <div className="space-y-3">
        {receiptStatus === IgpPaymentsStatus.Pending && (
          <KeyValueRow
            label="Total paid:"
            classes={paymentRowClasses}
            labelWidth="w-24"
            display="Loading..."
            allowZeroish={true}
            blurValue={blur}
          />
        )}
        {receiptStatus !== IgpPaymentsStatus.Pending && !receiptTotals && (
          <KeyValueRow
            label="Total paid:"
            classes={paymentRowClasses}
            labelWidth="w-24"
            display={hasPaymentAmount ? formatRawUnits(totalPaymentWei.toFixed()) : 'Not available'}
            subDisplay={hasPaymentAmount ? '(unit unverified)' : undefined}
            allowZeroish={true}
            blurValue={blur}
          />
        )}
        {receiptTotals && (
          <>
            {!receiptTotals.length && (
              <KeyValueRow
                label="Paid at dispatch:"
                classes={paymentRowClasses}
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
                classes={paymentRowClasses}
                labelWidth={receiptLabelWidth}
                display={total.display}
                subDisplay={total.usd ? `(${total.usd})` : undefined}
                allowZeroish={true}
                blurValue={blur}
              />
            ))}
          </>
        )}
        {otherPayments && (
          <KeyValueRow
            label="Other payments:"
            classes={paymentRowClasses}
            labelWidth={receiptLabelWidth}
            display={formatOtherPayments(otherPayments)}
            allowZeroish={true}
            blurValue={blur}
          />
        )}
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-200/70 pt-2 text-xs">
        <div className="flex min-w-0 flex-wrap gap-x-1.5">
          <dt className="text-gray-500">Payment count:</dt>
          <dd className={`break-all font-mono text-gray-700 ${blur ? 'blur-xs' : ''}`}>
            {hasPaymentCount ? numPayments.toString() : 'Not available'}
          </dd>
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-1.5">
          <dt className="text-gray-500">Total gas amount:</dt>
          <dd className={`break-all font-mono text-gray-700 ${blur ? 'blur-xs' : ''}`}>
            {hasGasAmount ? totalGasAmount.toString() : 'Not available'}
          </dd>
        </div>
      </dl>
      {nativeDecimals !== undefined &&
        !hasTokenPayments &&
        !otherPayments &&
        !isDenominationUnresolved &&
        !!paymentsWithAddr.length && (
          <details className="pt-1">
            <summary className="cursor-pointer text-xs text-gray-500">IGP payment records</summary>
            <div className="mt-2 overflow-x-auto">
              <IgpPaymentsTable
                payments={paymentsWithAddr}
                nativeUsdPrice={nativeUsdPrice}
                nativeDecimals={nativeDecimals}
                nativeSymbol={nativeSymbol}
              />
            </div>
          </details>
        )}
    </div>
  );
}

const paymentRowClasses =
  '!flex-col !items-start !gap-1 [&>label]:w-auto [&>label]:text-xs [&>div]:w-full [&>div>span]:overflow-visible [&>div>span]:text-clip [&>div>span]:whitespace-normal [&>div>span]:break-all [&>div>span]:text-base [&>div>span]:font-medium [&>div>span]:text-primary-900 [&>div>span>span]:font-normal [&>div>span>span]:text-gray-500';

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
