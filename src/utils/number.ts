import { BigNumber, BigNumberish } from 'ethers';

import { logger } from './logger';

export function tryHexToDecimal(value: BigNumberish) {
  try {
    return BigNumber.from(value).toNumber();
  } catch (error) {
    logger.debug(`Error parsing hex number ${value}`);
    return null;
  }
}

export function hexToDecimal(value: BigNumberish) {
  const result = tryHexToDecimal(value);
  if (!result) throw new Error(`Error parsing hex number ${value}`);
  return result;
}
