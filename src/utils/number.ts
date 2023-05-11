import { BigNumber, BigNumberish, constants } from 'ethers';

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

// If a value (e.g. hex string or number) is zeroish (0, 0x0, 0x00, etc.)
export function isZeroish(value: BigNumberish) {
  try {
    if (!value || value === constants.HashZero || value === constants.AddressZero) return true;
    return BigNumber.from(value).isZero();
  } catch (error) {
    return false;
  }
}
