import { isValidAddressFast, isValidTransactionHash } from '../../utils/addresses';

export function isValidSearchQuery(input: string, allowAddress?: boolean) {
  if (!input) return false;
  if (isValidTransactionHash(input)) return true;
  if (allowAddress && isValidAddressFast(input)) return true;
  return false;
}
