import { fromWei, isNullish, shortenAddress } from '@hyperlane-xyz/utils';
import BigNumber from 'bignumber.js';

import { IgpPayment, IgpPaymentDenom, IgpPaymentDenomKind } from '../igpPayments';

export interface TokenMetadata {
  symbol: string;
  decimals: number;
  coinGeckoId?: string;
}

// `decimals` is undefined when the token's metadata could not be resolved, in which
// case amounts are shown in raw units.
export interface PaymentAsset {
  id: string;
  symbol: string;
  decimals?: number;
  coinGeckoId?: string;
}

export const NATIVE_ASSET_ID = 'native';
const AMBIGUOUS_ASSET_ID = 'ambiguous';
const AMBIGUOUS_ASSET_SYMBOL = 'unknown token';

export interface PaymentTotal {
  id: string;
  label: string;
  display: string;
  usd: string | null;
}

export function hasNonNativePayments(payments: IgpPayment[]): boolean {
  return payments.some((p) => p.denom.kind !== IgpPaymentDenomKind.Native);
}

export function resolvePaymentAsset(
  denom: IgpPaymentDenom,
  nativeAsset: PaymentAsset,
  tokenMetadata: Record<string, TokenMetadata>,
): PaymentAsset {
  switch (denom.kind) {
    case IgpPaymentDenomKind.Native:
      return nativeAsset;
    case IgpPaymentDenomKind.Ambiguous:
      return { id: AMBIGUOUS_ASSET_ID, symbol: AMBIGUOUS_ASSET_SYMBOL };
    case IgpPaymentDenomKind.Token: {
      const id = denom.address.toLowerCase();
      const metadata = tokenMetadata[id];
      if (!metadata) return { id, symbol: shortenAddress(denom.address) };
      return {
        id,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        coinGeckoId: metadata.coinGeckoId,
      };
    }
  }
}

export function formatRawUnits(amountRaw: string, unit?: string): string {
  return `${amountRaw} raw units${unit ? ` (${unit})` : ''}`;
}

export function formatPaymentAmount(amountRaw: string, asset: PaymentAsset): string {
  if (isNullish(asset.decimals)) return formatRawUnits(amountRaw, asset.symbol);
  return `${fromWei(amountRaw, asset.decimals)} ${asset.symbol}`;
}

export function formatPaymentUsd(
  amountRaw: string,
  asset: PaymentAsset,
  usdPrice: number | null,
): string | null {
  if (isNullish(usdPrice) || isNullish(asset.decimals)) return null;
  return formatUsd(new BigNumber(fromWei(amountRaw, asset.decimals)).times(usdPrice));
}

// One "Paid at dispatch" entry per payment denomination, in order of first appearance. USD is only
// present when `getUsdPrice` returns a price for the asset.
export function summarizePayments(
  payments: IgpPayment[],
  nativeAsset: PaymentAsset,
  tokenMetadata: Record<string, TokenMetadata>,
  getUsdPrice: (asset: PaymentAsset) => number | null,
): PaymentTotal[] {
  const assetTotals = new Map<string, { asset: PaymentAsset; totalRaw: BigNumber }>();

  for (const p of payments) {
    const asset = resolvePaymentAsset(p.denom, nativeAsset, tokenMetadata);
    const total = assetTotals.get(asset.id) ?? { asset, totalRaw: new BigNumber(0) };
    assetTotals.set(asset.id, { asset, totalRaw: total.totalRaw.plus(p.paymentAmount) });
  }

  const hasMultipleAssets = assetTotals.size > 1;
  return [...assetTotals.values()].map(({ asset, totalRaw }) => ({
    id: asset.id,
    label: hasMultipleAssets ? `Paid at dispatch (${asset.symbol}):` : 'Paid at dispatch:',
    display: formatPaymentAmount(totalRaw.toFixed(), asset),
    usd: formatPaymentUsd(totalRaw.toFixed(), asset, getUsdPrice(asset)),
  }));
}

export function sumPayments(
  payments: IgpPayment[],
  field: 'gasAmount' | 'paymentAmount',
): BigNumber {
  return payments.reduce((sum, p) => sum.plus(p[field]), new BigNumber(0));
}

export interface OtherPayments {
  count: number;
  rawAmount?: string;
}

// The payments a message has beyond the ones found in its origin tx receipt (e.g. later top-ups).
// Their denomination is unknown, so only their count and raw amount can be reported.
export function getOtherPayments(
  numPayments: number,
  totalPaymentRaw: BigNumber,
  receiptPayments: IgpPayment[],
): OtherPayments | undefined {
  const count = numPayments - receiptPayments.length;
  if (count <= 0) return undefined;
  const rawAmount = totalPaymentRaw.minus(sumPayments(receiptPayments, 'paymentAmount'));
  return { count, rawAmount: rawAmount.gt(0) ? rawAmount.toFixed() : undefined };
}

export function formatOtherPayments({ count, rawAmount }: OtherPayments): string {
  const payments = `${count} ${count === 1 ? 'payment' : 'payments'}`;
  const amount = rawAmount ? `, ${formatRawUnits(rawAmount)}` : '';
  return `${payments}${amount} (unit unknown)`;
}

export function formatUsd(value: BigNumber): string {
  const num = value.toNumber();
  const fractionDigits = num !== 0 && Math.abs(num) < 0.01 ? 6 : 2;
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  });
}
