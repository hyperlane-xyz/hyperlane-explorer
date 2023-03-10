import { BigNumber } from 'ethers';

import { logger } from './logger';

export function tryHexToDecimal(value: string | number) {
  try {
    return BigNumber.from(value).toNumber();
  } catch (error) {
    logger.debug(`Error parsing hex number ${value}`);
    return null;
  }
}

export function hexToDecimal(value: string | number) {
  const result = tryHexToDecimal(value);
  if (!result) throw new Error(`Error parsing hex number ${value}`);
  return result;
}
