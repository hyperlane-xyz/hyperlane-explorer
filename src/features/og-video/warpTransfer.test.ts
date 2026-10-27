import type { WarpToken } from '../../utils/yamlParsing';
import type { MessageOGData } from '../messages/queries/serverFetch';
import { getWarpTransferDetails, sanitizeSymbol } from './warpTransfer';

const sender = '0x' + '11'.repeat(32);
const message: MessageOGData = {
  msgId: '0x' + '22'.repeat(32),
  status: 'Delivered',
  originDomainId: 1,
  destinationDomainId: 2,
  originTxHash: '0x' + '33'.repeat(32),
  timestamp: 0,
  sender,
  recipient: '0x' + '44'.repeat(32),
  deliveryLatency: null,
  body: '0x' + '00'.repeat(32) + 42_500_000n.toString(16).padStart(64, '0'),
};
const token: WarpToken = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  logoURI: '',
  chainName: 'base',
  addressOrDenom: sender,
};
const routes = new Map([['base', new Map([[sender, token]])]]);

describe('shared OG transfer data', () => {
  it('uses origin decimals for the same amount in image and video cards', () => {
    expect(getWarpTransferDetails(message, 'base', routes)?.amount).toBe('42.5');
  });
  it('applies the origin token scale before formatting', () => {
    const scaled = new Map([['base', new Map([[sender, { ...token, scale: 1000 }]])]]);
    expect(getWarpTransferDetails(message, 'base', scaled)?.amount).toBe('0.0425');
  });
  it('does not treat an arbitrary sender or malformed body as a token transfer', () => {
    expect(getWarpTransferDetails({ ...message, sender: '0x1234' }, 'base', routes)).toBeNull();
    expect(getWarpTransferDetails({ ...message, body: '0x1234' }, 'base', routes)).toBeNull();
  });
  it('normalizes unsupported token-symbol glyphs consistently', () => {
    expect(sanitizeSymbol('USD₮')).toBe('USDT');
  });
});
