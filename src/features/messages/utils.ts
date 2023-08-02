import { BigNumber } from 'bignumber.js';
import { utils } from 'ethers/lib/ethers';
import { Message, MessageStub } from '../../types';
import { fromBase64, toBase64 } from '../../utils/base64';
import { logger } from '../../utils/logger';

export function serializeMessage(msg: MessageStub | Message): string | undefined {
  return toBase64(msg);
}

export function deserializeMessage<M extends MessageStub>(data: string | string[]): M | undefined {
  return fromBase64<M>(data);
}

export function  computeAvgGasPrice(unit: string, gasAmount?: BigNumber.Value, payment?: BigNumber.Value) {
  try {
    if (!gasAmount || !payment) return null;
    const gasBN = new BigNumber(gasAmount);
    const paymentBN = new BigNumber(payment);
    if (gasBN.isZero() || paymentBN.isZero()) return null;
    const wei = paymentBN.div(gasAmount).toFixed(0);
    const formatted = utils.formatUnits(wei, unit).toString();
    return { wei, formatted };
  } catch (error) {
    logger.debug('Error computing avg gas price', error);
    return null;
  }
}
