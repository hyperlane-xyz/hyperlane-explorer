import { withServerRpcConnections } from './serverRpc';

describe('withServerRpcConnections', () => {
  it('preserves RPC settings and disables Ethers browser fetch setup', () => {
    const metadata = {
      ethereum: {
        rpcUrls: [{ http: 'https://rpc.example', concurrency: 3 }],
      },
    };

    const result = withServerRpcConnections(metadata);

    expect(result.ethereum.rpcUrls).toEqual([
      {
        http: 'https://rpc.example',
        concurrency: 3,
        connection: { url: 'https://rpc.example', skipFetchSetup: true },
      },
    ]);
  });
});
