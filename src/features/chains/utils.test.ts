import { getMailboxAddress } from './utils';

const registryMailbox = '0x0000000000000000000000000000000000000001';
const overrideMailbox = '0x000000000000000000000000000000000000dEaD';

describe('getMailboxAddress', () => {
  it('prefers the registry mailbox over an override', async () => {
    const registry = { getChainAddresses: async () => ({ mailbox: registryMailbox }) };

    const mailbox = await getMailboxAddress(
      'ethereum',
      { ethereum: { mailbox: overrideMailbox } },
      registry,
    );

    expect(mailbox).toBe(registryMailbox);
  });

  it('falls back to the override mailbox for custom chains', async () => {
    const registry = { getChainAddresses: async () => null };

    const mailbox = await getMailboxAddress(
      'mychain',
      { mychain: { mailbox: overrideMailbox } },
      registry,
    );

    expect(mailbox).toBe(overrideMailbox);
  });
});
