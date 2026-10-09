import { IERC20Metadata__factory as Erc20MetadataFactory } from '@hyperlane-xyz/core';
import { skipToken, useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useChainMetadataReady, useChainMetadataResolver, useStore } from '../../../metadataStore';
import {
  useMultiProviderInitFailed,
  useMultiProviderVersion,
  useReadyMultiProvider,
} from '../../../store';
import { Message, MessageStub } from '../../../types';
import { logger } from '../../../utils/logger';
import { findErc20TokenInWarpRouteChainAddressMap } from '../../../utils/token';
import { isEvmChain } from '../../chains/utils';
import type { ExplorerMultiProvider as MultiProtocolProvider } from '../../hyperlane/sdkRuntime';
import {
  getIgpPaymentsStatus,
  IgpPayment,
  IgpPaymentDenomKind,
  IgpPaymentsStatus,
  IgpPaymentsStatusValue,
  parseIgpPayments,
} from '../igpPayments';
import { TokenMetadata } from './gasPaymentSummary';

/**
 * Per-payment breakdown (incl. ERC20 payments) of the IGP payments made for a message,
 * read from its origin tx receipt, plus the metadata of the tokens that were paid with.
 *
 * `status` is Disabled when the receipt is not read (disabled, non-EVM origin, no tx hash, or
 * the provider or chain metadata failed to load), Pending while it is being read (or the chain
 * metadata needed to tell is loading), and Error when it could not be. `payments` is only
 * defined when Ready. Token metadata comes from the warp route registry when the token is
 * part of a route, otherwise from the token contract. Tokens without resolved metadata are
 * absent from `tokenMetadata`.
 */
export function useIgpPayments(
  message: Message | MessageStub,
  enabled: boolean,
): {
  status: IgpPaymentsStatusValue;
  payments: IgpPayment[] | undefined;
  tokenMetadata: Record<string, TokenMetadata>;
} {
  const multiProvider = useReadyMultiProvider();
  const multiProviderVersion = useMultiProviderVersion();
  const chainMetadataResolver = useChainMetadataResolver();
  const warpRouteChainAddressMap = useStore((s) => s.warpRouteChainAddressMap);
  const isChainMetadataReady = useChainMetadataReady();
  const hasChainMetadataError = useStore((s) => !!s.chainMetadataError);
  const hasProviderInitFailed = useMultiProviderInitFailed();
  const { originDomainId, origin, msgId } = message;
  const isEnabled = enabled && !!origin.hash;
  const isEvmOrigin = isEvmChain(chainMetadataResolver, originDomainId);
  const canQuery = isEnabled && isEvmOrigin;

  const { data, error } = useQuery({
    queryKey: ['igpPayments', originDomainId, origin.hash, msgId, multiProviderVersion],
    queryFn:
      canQuery && multiProvider
        ? async () => {
            const provider = multiProvider.getEthersV5Provider(originDomainId);
            const receipt = await provider.getTransactionReceipt(origin.hash);
            // Receipt not yet available - throw so React Query retries
            if (!receipt) throw new Error(`No receipt for tx ${origin.hash}`);
            return parseIgpPayments(receipt.logs, msgId);
          }
        : skipToken,
    // Receipts are immutable once mined
    staleTime: Infinity,
  });

  useEffect(() => {
    if (error) logger.warn('Error fetching IGP payments from origin tx receipt', error);
  }, [error]);

  const status = getIgpPaymentsStatus({
    isEnabled,
    hasInitFailed: hasProviderInitFailed || hasChainMetadataError,
    isChainMetadataReady,
    isEvmOrigin,
    hasData: data !== undefined,
    hasError: !!error,
  });
  const payments = status === IgpPaymentsStatus.Ready ? data : undefined;

  const chainName = chainMetadataResolver.tryGetChainName(originDomainId);
  const tokenAddresses = useMemo(() => getTokenAddresses(payments), [payments]);
  const registryTokens = tokenAddresses.map((address) =>
    chainName
      ? findErc20TokenInWarpRouteChainAddressMap(chainName, address, warpRouteChainAddressMap)
      : undefined,
  );

  const onChainTokens = useQueries({
    queries: tokenAddresses.map((address, i) => ({
      queryKey: ['erc20Metadata', originDomainId, address.toLowerCase(), multiProviderVersion],
      queryFn:
        !registryTokens[i] && multiProvider
          ? () => fetchErc20Metadata(multiProvider, originDomainId, address)
          : skipToken,
      staleTime: Infinity,
    })),
  });

  const tokenMetadata: Record<string, TokenMetadata> = {};
  tokenAddresses.forEach((address, i) => {
    const registryToken = registryTokens[i];
    const metadata: TokenMetadata | undefined = registryToken
      ? {
          symbol: registryToken.symbol,
          decimals: registryToken.decimals,
          coinGeckoId: registryToken.coinGeckoId,
        }
      : onChainTokens[i].data;
    if (metadata) tokenMetadata[address.toLowerCase()] = metadata;
  });

  return { status, payments, tokenMetadata };
}

function getTokenAddresses(payments?: IgpPayment[]): Address[] {
  const addresses = new Map<string, Address>();
  for (const { denom } of payments ?? []) {
    if (denom.kind === IgpPaymentDenomKind.Token) {
      addresses.set(denom.address.toLowerCase(), denom.address);
    }
  }
  return [...addresses.values()];
}

async function fetchErc20Metadata(
  multiProvider: MultiProtocolProvider,
  domainId: number,
  address: Address,
): Promise<TokenMetadata> {
  try {
    const token = Erc20MetadataFactory.connect(
      address,
      multiProvider.getEthersV5Provider(domainId),
    );
    const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
    return { symbol, decimals };
  } catch (error) {
    logger.warn('Error fetching ERC20 metadata for IGP payment token', { address, error });
    throw error;
  }
}
