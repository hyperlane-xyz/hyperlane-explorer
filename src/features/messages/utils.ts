import { createWeb3Name } from '@web3-name-sdk/core';

import { fromBase64, toBase64 } from '@hyperlane-xyz/utils';

import { Message, MessageStub } from '../../types';

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  return toBase64(msg);
}

export function deserializeMessage<M extends MessageStub>(data: string | string[]): M | undefined {
  return fromBase64<M>(data);
}

export async function resolveAddressToDomain(address: string, chainId: number) {
  const web3Name = createWeb3Name();
  const domain = await web3Name.getDomainName({
    address,
    queryChainIdList: [chainId],
  });
  return domain;
}
