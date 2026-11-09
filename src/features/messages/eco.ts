import type { MessageStub } from '../../types';

// Eco Routes 2.12 HyperProver, verified via PORTAL(), getProofType() and version().
// Match both endpoints; matching payload bytes alone does not identify the application.
const hyperProver = /^(?:0x)?(?:0{24})?ec08fb4647f3f50d1162a578d481266687c60fc5$/i;
// Low 20 bytes of keccak256("eco.portal.intent.cancelled"), from Eco's Intent.sol.
const cancelledClaimant = '0xe685056aec77686a83e2a6bdf37c6f71dd2fdb5f';

type EcoMessage = Pick<MessageStub, 'sender' | 'recipient' | 'body'>;

export function isEcoMessage(message: Pick<EcoMessage, 'sender' | 'recipient'>) {
  return hyperProver.test(message.sender) && hyperProver.test(message.recipient);
}

export function decodeEcoMessage(message: EcoMessage) {
  if (!isEcoMessage(message)) return null;
  const hex = message.body.match(/^0x([0-9a-f]*)$/i)?.[1];
  // Inbox._prove packs uint64 chainId, then zero or more (bytes32 intentHash, bytes32 claimant).
  if (hex === undefined || hex.length < 16 || (hex.length - 16) % 128 !== 0) {
    return { error: 'Unsupported Eco proof payload. View the original bytes in Hex.' };
  }
  const proofs: Array<{
    intentHash: string;
    claimant: string;
    outcome: 'fulfillment' | 'cancellation' | 'ignored';
  }> = [];
  for (let offset = 16; offset < hex.length; offset += 128) {
    const claimantBytes = hex.slice(offset + 64, offset + 128);
    const isEvmClaimant = /^0{24}[0-9a-f]{40}$/i.test(claimantBytes);
    const claimant = `0x${isEvmClaimant ? claimantBytes.slice(24) : claimantBytes}`;
    proofs.push({
      intentHash: `0x${hex.slice(offset, offset + 64)}`,
      claimant,
      // BaseProver skips zero/non-EVM claimants; cancellation is an explicit reserved address.
      outcome:
        !isEvmClaimant || /^0x0+$/i.test(claimant)
          ? 'ignored'
          : claimant.toLowerCase() === cancelledClaimant
            ? 'cancellation'
            : 'fulfillment',
    });
  }
  return { executionChainId: BigInt(`0x${hex.slice(0, 16)}`).toString(), proofs };
}
