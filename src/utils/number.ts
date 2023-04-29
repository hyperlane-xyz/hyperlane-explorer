import { BigNumber, BigNumberish } from 'ethers';

import { logger } from './logger';
import { isNullish } from './typeof';

export function tryToDecimalNumber(value: BigNumberish) {
  try {
    return BigNumber.from(value.toString()).toNumber();
  } catch (error) {
    logger.debug(`Error parsing hex number ${value}`);
    return null;
  }
}

export function toDecimalNumber(value: BigNumberish) {
  const result = tryToDecimalNumber(value);
  if (result === null || result === undefined) throw new Error(`Error parsing hex number ${value}`);
  return result;
}

export function isBigNumberish(value: any): value is BigNumberish {
  try {
    if (isNullish(value)) return false;
    return BigNumber.from(value)._isBigNumber;
  } catch (error) {
    return false;
  }
}
