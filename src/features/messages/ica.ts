import { Message } from '../../types';
import { areAddressesEqual } from '../../utils/addresses';
import { logger } from '../../utils/logger';

export function isIcaMessage({ hash, sender, recipient }: Message) {
  const isSenderIca = isAddressIcaRouter(sender);
  const isRecipIca = isAddressIcaRouter(recipient);
  if (isSenderIca && isRecipIca) return true;
  if (isSenderIca && !isRecipIca) {
    logger.warn('Msg sender is ICA router but not recip', sender, recipient, hash);
  }
  if (!isSenderIca && isRecipIca) {
    logger.warn('Msg recip is ICA router but not sender', recipient, sender, hash);
  }
  return false;
}

function isAddressIcaRouter(addr: string) {
  // TODO use address from sdk
  const icaRouterAddr = '0xffD17672d47E7bB6192d5dBc12A096e00D1a206F';
  return areAddressesEqual(addr, icaRouterAddr);
}
