import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';

const RPC_PROXY_PATH = '/api/rpc-proxy';
const DEPRIORITIZED_RPC_HOSTS = ['drpc.org', 'llamarpc.com', 'merkle.io'];

function getRpcProxyOrigin() {
  if (typeof window === 'undefined') return null;
  return window.location.origin;
}

function isAlreadyProxied(rpcUrl: string, proxyOrigin: string) {
  return (
    rpcUrl.startsWith(`${proxyOrigin}${RPC_PROXY_PATH}?`) || rpcUrl.startsWith(`${RPC_PROXY_PATH}?`)
  );
}

export function getBrowserRpcProxyUrl(rpcUrl: string) {
  const proxyOrigin = getRpcProxyOrigin();
  if (!proxyOrigin || isAlreadyProxied(rpcUrl, proxyOrigin)) return rpcUrl;

  const proxyUrl = new URL(RPC_PROXY_PATH, proxyOrigin);
  proxyUrl.searchParams.set('url', rpcUrl);
  return proxyUrl.toString();
}

function getRpcPenalty(rpcUrl: string) {
  try {
    const { hostname } = new URL(rpcUrl);
    return DEPRIORITIZED_RPC_HOSTS.some(
      (blockedHost) => hostname === blockedHost || hostname.endsWith(`.${blockedHost}`),
    )
      ? 1
      : 0;
  } catch {
    return 0;
  }
}

function normalizeRpcUrls<
  RpcUrl extends {
    http: string;
  },
>(rpcUrls: RpcUrl[]) {
  return rpcUrls
    .map((rpcUrl, index) => ({
      rpcUrl,
      index,
      penalty: getRpcPenalty(rpcUrl.http),
    }))
    .sort((a, b) => a.penalty - b.penalty || a.index - b.index)
    .map(({ rpcUrl }) => rpcUrl);
}

export function proxyChainMetadataRpcUrls<MetaExt = {}>(
  chainMetadata: ChainMap<ChainMetadata<MetaExt>>,
): ChainMap<ChainMetadata<MetaExt>> {
  if (typeof window === 'undefined') return chainMetadata;

  return Object.fromEntries(
    Object.entries(chainMetadata).map(([chainName, metadata]) => [
      chainName,
      {
        ...metadata,
        rpcUrls: normalizeRpcUrls(metadata.rpcUrls).map((rpcUrl) => ({
          ...rpcUrl,
          http: getBrowserRpcProxyUrl(rpcUrl.http),
        })),
      },
    ]),
  );
}
