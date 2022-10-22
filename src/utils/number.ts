import { BigNumber } from 'ethers';

import { logger } from './logger';

export function hexToDecimal(value: string | number) {
  try {
    return BigNumber.from(value).toNumber();
  } catch (error) {
    const msg = `Error parsing hex number ${value}`;
    logger.error(msg, error);
    throw new Error(msg);
  }
}
