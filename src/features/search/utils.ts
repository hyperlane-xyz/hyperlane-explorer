import {
  isValidAddressFast,
  isValidTransactionHash,
} from '../../utils/addresses';

export function isValidSearchQuery(input: string) {
  if (!input) return false;
  if (isValidTransactionHash(input)) return true;
  if (isValidAddressFast(input)) return true;
  return false;
}
