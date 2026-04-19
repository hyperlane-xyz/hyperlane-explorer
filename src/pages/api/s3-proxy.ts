import type { NextApiRequest, NextApiResponse } from 'next';

const ALLOWED_HOSTNAME = /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i;
const ALLOWED_PATHNAME = /\/[^/?]+\.json$/i;

function getUrlParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseTargetUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTNAME.test(url.hostname)) return null;
  if (!ALLOWED_PATHNAME.test(url.pathname)) return null;

  return url;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = getUrlParam(req.query.url);
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url' });
  }

  const targetUrl = parseTargetUrl(rawUrl);
  if (!targetUrl) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const upstream = await fetch(targetUrl, {
    headers: {
      accept: 'application/json',
    },
  });

  if (upstream.status === 404) {
    return res.status(204).end();
  }

  if (!upstream.ok) {
    const body = await upstream.text();
    return res.status(upstream.status).send(body || 'Upstream request failed');
  }

  const contentType = upstream.headers.get('content-type');
  const lastModified = upstream.headers.get('last-modified');

  if (contentType) res.setHeader('Content-Type', contentType);
  if (lastModified) res.setHeader('Last-Modified', lastModified);
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  return res.status(200).send(await upstream.text());
}
