import { chainMetadata } from '@hyperlane-xyz/registry';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { Connection, PublicKey } from '@solana/web3.js';
import type { NextApiRequest, NextApiResponse } from 'next';

import { logger } from '../../utils/logger';

// Seeds used by hyperlane-sealevel-token-collateral and -cross-collateral
// to derive the escrow PDA that actually holds bridged collateral.
const ESCROW_PDA_SEEDS = [
  Buffer.from('hyperlane_token'),
  Buffer.from('-'),
  Buffer.from('escrow'),
];

type SuccessResponse = { balance: string };
type ErrorResponse = { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | ErrorResponse>,
) {
  const chain = typeof req.query.chain === 'string' ? req.query.chain : '';
  const warpRouter = typeof req.query.warpRouter === 'string' ? req.query.warpRouter : '';

  if (!chain || !warpRouter) {
    return res.status(400).json({ error: 'Missing chain or warpRouter' });
  }

  const metadata = chainMetadata[chain];
  if (!metadata) {
    return res.status(404).json({ error: `Chain ${chain} not in registry` });
  }
  if (metadata.protocol !== ProtocolType.Sealevel) {
    return res.status(400).json({ error: `Chain ${chain} is not sealevel` });
  }

  const rpcUrl = metadata.rpcUrls?.[0]?.http;
  if (!rpcUrl) {
    return res.status(500).json({ error: `No RPC URL configured for ${chain}` });
  }

  let programId: PublicKey;
  try {
    programId = new PublicKey(warpRouter);
  } catch {
    return res.status(400).json({ error: `Invalid warpRouter pubkey: ${warpRouter}` });
  }

  const [escrowPda] = PublicKey.findProgramAddressSync(ESCROW_PDA_SEEDS, programId);

  const connection = new Connection(rpcUrl, 'confirmed');
  try {
    const response = await connection.getTokenAccountBalance(escrowPda);
    // Hint downstream caches: balances change frequently enough that we
    // don't want stale CDN copies, but a few seconds is fine.
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ balance: response.value.amount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Missing escrow account is equivalent to a zero balance (e.g. a token
    // that has never received deposits). Surface as zero, not an error.
    if (msg.includes('could not find account') || msg.includes('Invalid param')) {
      return res.status(200).json({ balance: '0' });
    }
    logger.error('Sealevel balance RPC error', { chain, warpRouter, error: msg });
    return res.status(502).json({ error: msg });
  }
}
