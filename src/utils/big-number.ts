import BigNumber from 'bignumber.js';

export function BigNumberMin(bn1: BigNumber, bn2: BigNumber) {
  return bn1.gte(bn2) ? bn2 : bn1;
}

export function BigNumberMax(bn1: BigNumber, bn2: BigNumber) {
  return bn1.lte(bn2) ? bn2 : bn1;
}
