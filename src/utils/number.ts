import { BigNumber, BigNumberish } from 'ethers';

import { logger } from './logger';

export function tryToDecimalNumber(value: BigNumberish) {
  try {
    return BigNumber.from(value.toString()).toNumber();
  } catch {
    logger.debug(`Error parsing hex number ${value}`);
    return null;
  }
}

export function toDecimalNumber(value: BigNumberish) {
  const result = tryToDecimalNumber(value);
  if (result == null) throw new Error(`Error parsing number ${value}`);
  return result;
}
