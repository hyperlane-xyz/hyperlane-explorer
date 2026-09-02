import {
  BaseMetadataBuilder,
  MultisigMetadataBuilder,
  isMetadataBuildable,
  type MetadataBuildResult,
  type MetadataContext,
} from '@hyperlane-xyz/relayer/metadata';
import {
  type ChainName,
  type HyperlaneCore,
  type S3Config,
  type S3Receipt,
  S3Validator,
  S3Wrapper,
} from '@hyperlane-xyz/sdk';
import { eqAddress, errorToString, type ValidatorConfig } from '@hyperlane-xyz/utils';
import { z } from 'zod';

import { abortable } from './serverLimits';

const ANNOUNCEMENT_KEY = 'announcement.json';
const MAX_METADATA_FETCHES = 8;
export const MAX_METADATA_RESPONSE_BYTES = 128 * 1024;
const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const S3_REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const S3_FOLDER_PATTERN = /^[A-Za-z0-9._/-]+$/;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const validatorAnnouncementSchema = z.object({
  value: z.object({
    validator: z.string().regex(EVM_ADDRESS_PATTERN),
    mailbox_domain: z.number().int().nonnegative(),
    mailbox_address: z.string().regex(EVM_ADDRESS_PATTERN),
  }),
});

interface IoWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  signal: AbortSignal;
  onAbort: () => void;
}

export class SelfRelayIoLimit {
  private active = 0;
  private readonly queue: IoWaiter[] = [];

  constructor(private readonly maximum: number) {}

  async run<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await abortable(
        Promise.resolve().then(() => {
          if (signal.aborted) throw abortReason(signal);
          return operation();
        }),
        signal,
      );
    } finally {
      this.release();
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(abortReason(signal));
    if (this.active < this.maximum) {
      this.active += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: IoWaiter = {
        resolve,
        reject,
        signal,
        onAbort: () => undefined,
      };
      waiter.onAbort = () => {
        const index = this.queue.indexOf(waiter);
        if (index >= 0) this.queue.splice(index, 1);
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
      this.queue.push(waiter);
    });
  }

  private release() {
    const next = this.queue.shift();
    if (!next) {
      this.active -= 1;
      return;
    }

    next.signal.removeEventListener('abort', next.onAbort);
    next.resolve();
  }
}

export class SelfRelayMetadataBuilder {
  private readonly builder: BaseMetadataBuilder;

  constructor(
    core: HyperlaneCore,
    private readonly signal: AbortSignal,
  ) {
    const ioLimit = new SelfRelayIoLimit(MAX_METADATA_FETCHES);
    this.builder = new BaseMetadataBuilder(core);
    this.builder.multisigMetadataBuilder = new SafeMultisigMetadataBuilder(core, signal, ioLimit);
  }

  build(context: MetadataContext): Promise<MetadataBuildResult> {
    return abortable(this.builder.build(context), this.signal);
  }
}

class SafeMultisigMetadataBuilder extends MultisigMetadataBuilder {
  constructor(
    core: HyperlaneCore,
    private readonly signal: AbortSignal,
    private readonly ioLimit: SelfRelayIoLimit,
  ) {
    super(core);
  }

  protected override async s3Validators(
    originChain: ChainName,
    validators: string[],
  ): Promise<(S3Validator | undefined)[]> {
    this.validatorCache[originChain] ??= {};
    const toFetch = validators.filter(
      (validator) => !(validator in this.validatorCache[originChain]),
    );

    if (toFetch.length) {
      const validatorAnnounce = this.core.getContracts(originChain).validatorAnnounce;
      const storageLocations = await this.ioLimit.run(
        () => validatorAnnounce.getAnnouncedStorageLocations(toFetch),
        this.signal,
      );

      await Promise.all(
        toFetch.map(async (validator, index) => {
          const storageLocation = storageLocations[index].at(-1);
          if (!storageLocation) return;

          try {
            const s3Validator = await SafeS3Validator.create(
              storageLocation,
              this.signal,
              this.ioLimit,
            );
            if (!eqAddress(s3Validator.address, validator)) {
              throw new Error(`Storage announcement does not match validator ${validator}`);
            }
            this.validatorCache[originChain][validator] = s3Validator;
          } catch (error) {
            this.logger.warn(
              { validator, error: errorToString(error) },
              'Failed to initialize bounded S3 validator',
            );
          }
        }),
      );
    }

    return validators.map((validator) => this.validatorCache[originChain][validator]);
  }
}

class SafeS3Validator extends S3Validator {
  private constructor(validatorConfig: ValidatorConfig, s3Config: S3Config, s3Bucket: S3Wrapper) {
    super(validatorConfig, s3Config);
    this.s3Bucket = s3Bucket;
  }

  static async create(
    storageLocation: string,
    signal: AbortSignal,
    ioLimit: SelfRelayIoLimit,
  ): Promise<SafeS3Validator> {
    const s3Config = parseS3StorageLocation(storageLocation);
    const s3Bucket = new SafeS3Wrapper(s3Config, signal, ioLimit);
    const announcement = await s3Bucket.getS3Obj<unknown>(ANNOUNCEMENT_KEY);
    if (!announcement) throw new Error('No validator announcement found');

    const parsed = validatorAnnouncementSchema.parse(announcement.data);
    const validatorConfig: ValidatorConfig = {
      address: parsed.value.validator,
      localDomain: parsed.value.mailbox_domain,
      mailbox: parsed.value.mailbox_address,
    };
    return new SafeS3Validator(validatorConfig, s3Config, s3Bucket);
  }
}

class SafeS3Wrapper extends S3Wrapper {
  constructor(
    config: S3Config,
    private readonly signal: AbortSignal,
    private readonly ioLimit: SelfRelayIoLimit,
  ) {
    super(config);
  }

  override async getS3Obj<T>(key: string): Promise<S3Receipt<T> | undefined> {
    const url = new URL(this.url(key));
    const data = await this.ioLimit.run(() => fetchBoundedS3Json<T>(url, this.signal), this.signal);
    if (data === undefined) return undefined;

    return { data, modified: new Date(0) };
  }
}

export async function fetchBoundedS3Json<T>(
  url: URL,
  signal: AbortSignal,
  maxBytes = MAX_METADATA_RESPONSE_BYTES,
): Promise<T | undefined> {
  assertSafeS3Url(url);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal,
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Validator metadata fetch failed (${response.status})`);

  const advertisedLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw new Error(`Validator metadata exceeds ${maxBytes} bytes`);
  }
  if (!response.body) throw new Error('Validator metadata response has no body');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Validator metadata exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const data: T = JSON.parse(new TextDecoder().decode(body));
  return data;
}

export function parseS3StorageLocation(storageLocation: string): S3Config {
  if (!storageLocation.startsWith('s3://')) throw new Error('Unsupported validator storage');
  const [bucket, region, ...folderParts] = storageLocation.slice('s3://'.length).split('/');
  const folder = folderParts.join('/');
  if (
    !S3_BUCKET_PATTERN.test(bucket) ||
    bucket.includes('..') ||
    !S3_REGION_PATTERN.test(region) ||
    (folder &&
      (!S3_FOLDER_PATTERN.test(folder) || folder.length > 512 || folder.split('/').includes('..')))
  ) {
    throw new Error('Invalid validator S3 storage location');
  }

  return folder ? { bucket, region, folder, caching: true } : { bucket, region, caching: true };
}

export { isMetadataBuildable };

function assertSafeS3Url(url: URL) {
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes('.s3.') ||
    !url.hostname.endsWith('.amazonaws.com')
  ) {
    throw new Error('Unsafe validator metadata URL');
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Metadata fetch aborted');
}
