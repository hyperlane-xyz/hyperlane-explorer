import net from 'node:net';

import type { NextApiRequest, NextApiResponse } from 'next';

function getUrlParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hasBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') return true;
  if (
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  ) {
    return true;
  }

  if (!net.isIP(normalized)) return false;
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80:')) return true;

  const [first, second] = normalized.split('.').map(Number);
  if (first === 10 || first === 127 || first === 0) return true;
  if (first === 169 && second === 254) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;

  return false;
}

function stripCustomRpcHeaders(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return null;
  }

  if (hasBlockedHostname(parsed.hostname)) {
    return null;
  }

  const headers: Record<string, string> = {};
  const retainedParams: Array<[string, string]> = [];

  for (const [key, value] of parsed.searchParams) {
    if (key !== 'custom_rpc_header') {
      retainedParams.push([key, value]);
      continue;
    }

    const colonIndex = value.indexOf(':');
    if (colonIndex <= 0) continue;

    headers[value.slice(0, colonIndex)] = value.slice(colonIndex + 1);
  }

  parsed.search = '';
  retainedParams.forEach(([key, value]) => parsed.searchParams.append(key, value));

  return { url: parsed.toString(), headers };
}

function getRequestBody(req: NextApiRequest) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body ?? {});
}

function getJsonRpcErrorPayload(body: string, message: string) {
  const buildError = (request: unknown) => {
    const requestRecord =
      typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : null;

    return {
      jsonrpc: requestRecord?.jsonrpc === '2.0' ? '2.0' : '2.0',
      id: requestRecord?.id ?? null,
      error: {
        code: -32000,
        message,
      },
    };
  };

  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed.map(buildError);
    return buildError(parsed);
  } catch {
    return buildError(null);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = getUrlParam(req.query.url);
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url' });
  }

  const target = stripCustomRpcHeaders(rawUrl);
  if (!target) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const requestBody = getRequestBody(req);
  let upstream: Response;

  try {
    upstream = await fetch(target.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...target.headers,
      },
      body: requestBody,
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(
      getJsonRpcErrorPayload(
        requestBody,
        error instanceof Error ? `RPC proxy upstream fetch failed: ${error.message}` : 'RPC proxy upstream fetch failed',
      ),
    );
  }

  if (!upstream.ok) {
    const upstreamBody = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(
      getJsonRpcErrorPayload(
        requestBody,
        `RPC proxy upstream returned ${upstream.status}${upstreamBody ? `: ${upstreamBody}` : ''}`,
      ),
    );
  }

  const contentType = upstream.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');

  return res.status(upstream.status).send(await upstream.text());
}
