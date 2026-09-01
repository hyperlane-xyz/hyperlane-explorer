interface RpcMetadata {
  rpcUrls: Array<{ http: string }>;
}

interface ServerRpcMetadata {
  rpcUrls: Array<{
    http: string;
    connection: { url: string; skipFetchSetup: true };
  }>;
}

export function withServerRpcConnections<T extends RpcMetadata>(
  chainMetadata: Record<string, T>,
): Record<string, T & ServerRpcMetadata> {
  const result: Record<string, T & ServerRpcMetadata> = {};
  for (const [chainName, metadata] of Object.entries(chainMetadata)) {
    result[chainName] = {
      ...metadata,
      rpcUrls: metadata.rpcUrls.map((rpcUrl) => ({
        ...rpcUrl,
        // Ethers v5 otherwise adds referrer: "client", which Node's fetch rejects.
        connection: { url: rpcUrl.http, skipFetchSetup: true },
      })),
    };
  }
  return result;
}
