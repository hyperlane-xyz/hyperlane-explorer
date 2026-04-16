import { type S3Receipt, S3Wrapper } from '@hyperlane-xyz/sdk';

let isPatched = false;

export function ensureBrowserS3ProxyPatch() {
  if (typeof window === 'undefined' || isPatched) return;

  S3Wrapper.prototype.getS3Obj = async function getS3Obj<T>(
    this: S3Wrapper,
    key: string,
  ): Promise<S3Receipt<T> | undefined> {
    const url = `/api/s3-proxy?url=${encodeURIComponent(this.url(key))}`;
    const response = await fetch(url);

    if (response.status === 404) return undefined;
    if (!response.ok) {
      throw new Error(`Failed to fetch S3 object (${response.status})`);
    }

    const data = (await response.json()) as T;
    const modified = response.headers.get('last-modified');

    return {
      data,
      modified: modified ? new Date(modified) : new Date(0),
    };
  };

  isPatched = true;
}
