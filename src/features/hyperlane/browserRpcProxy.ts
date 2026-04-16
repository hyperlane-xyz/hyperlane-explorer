import type { ChainMetadata } from '@hyperlane-xyz/sdk/metadata/chainMetadataTypes';
import type { ChainMap } from '@hyperlane-xyz/sdk/types';

const RPC_PROXY_PATH = '/api/rpc-proxy';

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

export function proxyChainMetadataRpcUrls<MetaExt = {}>(
  chainMetadata: ChainMap<ChainMetadata<MetaExt>>,
): ChainMap<ChainMetadata<MetaExt>> {
  if (typeof window === 'undefined') return chainMetadata;

  return Object.fromEntries(
    Object.entries(chainMetadata).map(([chainName, metadata]) => [
      chainName,
      {
        ...metadata,
        rpcUrls: metadata.rpcUrls.map((rpcUrl) => ({
          ...rpcUrl,
          http: getBrowserRpcProxyUrl(rpcUrl.http),
        })),
      },
    ]),
  );
}
