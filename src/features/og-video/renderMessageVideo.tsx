import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from '@vercel/og';
import sharp from 'sharp';

import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from '../../consts/appMetadata';
import { links } from '../../consts/links';
import { logger } from '../../utils/logger';
import {
  fetchChainMetadata,
  fetchWarpRouteMap,
  getChainDisplayName,
} from '../../utils/yamlParsing';
import { fetchDomainNames, fetchMessageForOG } from '../messages/queries/serverFetch';
import { encodeVideo } from './encodeVideo';
import { MessageVideoCard, type VideoMessage } from './MessageVideoCard';
import { getWarpTransferDetails, sanitizeSymbol } from './warpTransfer';

// Trace Next's optional native rasterizer and bound its per-image worker pool.
sharp.concurrency(1);

async function loadAssets() {
  const logo = `data:image/svg+xml;base64,${await readFile(
    join(process.cwd(), 'public/images/hyperlane-explorer-logo.svg'),
    'base64',
  )}`;
  let fonts: { name: string; data: ArrayBuffer; weight: 400; style: 'normal' }[] | undefined;
  try {
    const data = await readFile(join(process.cwd(), 'public/fonts/PPFraktionMono-Regular.ttf'));
    fonts = [{ name: 'mono', data: new Uint8Array(data).buffer, weight: 400, style: 'normal' }];
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    logger.warn('OG video font unavailable; using the renderer bundled font');
  }
  return { logo, fonts };
}

/** All data and logo requests share a deadline; FFmpeg has its own bounded timeout. */
export async function renderMessageVideo(messageId: string): Promise<Buffer | null> {
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(5000);
  const [message, domains, metadata, warpRoutes, assets] = await Promise.all([
    fetchMessageForOG(messageId, signal),
    fetchDomainNames(signal),
    fetchChainMetadata(signal),
    fetchWarpRouteMap(signal),
    loadAssets(),
  ]);
  if (!message) return null;
  signal.throwIfAborted();
  const origin = domains.get(message.originDomainId);
  const destination = domains.get(message.destinationDomainId);
  const transfer = origin ? getWarpTransferDetails(message, origin, warpRoutes) : null;

  async function chain(domain: number, name: string | undefined) {
    if (!name) return { name: `Domain ${domain}`, logo: assets.logo };
    const response = await fetch(`${links.imgPath}/chains/${encodeURIComponent(name)}/logo.svg`, {
      signal,
    });
    if (!response.ok) {
      logger.warn(`OG video chain logo unavailable: ${name}`);
      return { name: getChainDisplayName(name, metadata), logo: assets.logo };
    }
    return {
      name: getChainDisplayName(name, metadata),
      logo: `data:image/svg+xml;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`,
    };
  }

  const [originChain, destinationChain] = await Promise.all([
    chain(message.originDomainId, origin),
    chain(message.destinationDomainId, destination),
  ]);
  const data: VideoMessage = {
    ...message,
    origin: originChain,
    destination: destinationChain,
    transfer: transfer
      ? { amount: transfer.amount, symbol: sanitizeSymbol(transfer.token.symbol) }
      : null,
  };
  const options = { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, fonts: assets.fonts };
  const render = async (time: number) =>
    Buffer.from(
      await new ImageResponse(
        <MessageVideoCard message={data} time={time} logo={assets.logo} showPacket={false} />,
        options,
      ).arrayBuffer(),
    );
  const delivered = message.status === 'Delivered';
  const [first, last, packet] = await Promise.all([
    render(0),
    render(delivered ? 5 : 0),
    new ImageResponse(
      <div
        style={{
          display: 'flex',
          width: 64,
          height: 64,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: '#e1bbff',
            boxShadow: '0 0 20px #b26bff',
            transform: 'rotate(45deg)',
          }}
        />
      </div>,
      { width: 64, height: 64 },
    )
      .arrayBuffer()
      .then((buffer) => Buffer.from(buffer)),
  ]);
  const remaining = 8000 - (Date.now() - startedAt);
  if (remaining <= 0) throw new Error('OG video rendering exceeded its time budget');
  return encodeVideo({ kind: delivered ? 'delivered' : 'pending', first, last, packet }, remaining);
}
