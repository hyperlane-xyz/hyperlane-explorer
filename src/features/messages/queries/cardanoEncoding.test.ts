import type { ChainMetadata } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';

import { builtinChainMetadata } from '../../../consts/chains';
import {
  addressToPostgresBytea,
  postgresByteaToAddress,
  postgresByteaToTxHash,
  searchValueToPostgresBytea,
} from './encoding';

const cardanoPreview = builtinChainMetadata.cardanopreview as ChainMetadata;

// A script-credential sender, as the Cardano indexer records it:
// [0x02, 0x00, 0x00, 0x00, <28-byte script hash>].
const SCRIPT_SENDER_BYTEA = '\\x02000000' + '12'.repeat(28);
const SCRIPT_SENDER_ADDRESS = 'addr_test1wqfpyysjzgfpyysjzgfpyysjzgfpyysjzgfpyysjzgfpyysu9csdk';

// Right-aligned in the H512 transaction id, so the scraper stores 32 bytes.
const TX_HASH = 'aa'.repeat(32);

describe('Cardano message encoding', () => {
  it('renders script credentials as bech32 addresses', () => {
    expect(postgresByteaToAddress(SCRIPT_SENDER_BYTEA, cardanoPreview)).toEqual(
      SCRIPT_SENDER_ADDRESS,
    );
  });

  it('renders transaction hashes as bare hex', () => {
    expect(postgresByteaToTxHash(`\\x${TX_HASH}`, cardanoPreview)).toEqual(TX_HASH);
  });

  it('encodes a bech32 address back to the bytes the scraper stored', () => {
    expect(addressToPostgresBytea(SCRIPT_SENDER_ADDRESS)).toEqual(SCRIPT_SENDER_BYTEA);
  });

  it('encodes a searched transaction hash to the bytes the scraper stored', () => {
    expect(searchValueToPostgresBytea(TX_HASH)).toEqual(`\\x${TX_HASH}`);
  });

  it('finds messages by searching for a Cardano address', () => {
    expect(searchValueToPostgresBytea(SCRIPT_SENDER_ADDRESS)).toEqual(SCRIPT_SENDER_BYTEA);
  });

  it('describes the Cardano test networks as Cardano chains', () => {
    for (const name of ['cardano', 'cardanopreprod', 'cardanopreview']) {
      expect(builtinChainMetadata[name].protocol).toEqual(ProtocolType.Cardano);
    }
    expect(builtinChainMetadata.cardanopreview.domainId).toEqual(2003);
    expect(builtinChainMetadata.cardano.bech32Prefix).toEqual('addr');
    expect(builtinChainMetadata.cardanopreview.bech32Prefix).toEqual('addr_test');
  });
});
