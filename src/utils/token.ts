import { parseWarpRouteMessage } from '@hyperlane-xyz/utils';
import { utils } from 'ethers';
import { postgresByteaToAddress } from '../features/messages/queries/encoding';
import { WarpRouteDetails } from '../types';

export function parseWarpRouteDetails(
  messageBody: string,
  originTx: { to?: string; from?: string } = {},
  gasInfo: { totalPayment: any },
  metadata?: any
): WarpRouteDetails | undefined {
  try {
    if (!messageBody?.trim()) throw new Error('Invalid message body');

    const parsedMessage = parseWarpRouteMessage(messageBody);

    return {
      token: originTx?.to ? postgresByteaToAddress(originTx.to, metadata) : 'Unknown Token',
      amount: utils.formatEther(parsedMessage.amount.toString()),
      totalPayment: utils.formatEther(gasInfo.totalPayment.toString())
    };
  } catch (error) {
    console.error('Failed to parse token details:', error, 'Message body:', messageBody);
    return undefined;
  }
}
