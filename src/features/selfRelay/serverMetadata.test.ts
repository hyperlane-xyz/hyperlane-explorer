import {
  SelfRelayIoLimit,
  fetchBoundedS3Json,
  parseS3StorageLocation,
  parseValidatorAnnouncement,
} from './serverMetadata';

describe('SelfRelayIoLimit', () => {
  it('bounds concurrent metadata operations', async () => {
    const controller = new AbortController();
    const limit = new SelfRelayIoLimit(1);
    const started = createDeferred();
    const release = createDeferred();
    const first = limit.run(async () => {
      started.resolve();
      await release.promise;
    }, controller.signal);
    let secondStarted = false;
    const second = limit.run(async () => {
      secondStarted = true;
    }, controller.signal);

    await started.promise;
    expect(secondStarted).toBe(false);
    release.resolve();
    await first;
    await second;
    expect(secondStarted).toBe(true);
  });

  it('removes queued metadata operations when aborted', async () => {
    const activeController = new AbortController();
    const queuedController = new AbortController();
    const limit = new SelfRelayIoLimit(1);
    const started = createDeferred();
    const release = createDeferred();
    const first = limit.run(async () => {
      started.resolve();
      await release.promise;
    }, activeController.signal);
    await started.promise;
    const queued = limit.run(async () => undefined, queuedController.signal);

    queuedController.abort(new Error('cancelled'));
    await expect(queued).rejects.toThrow('cancelled');
    release.resolve();
    await first;
  });
});

function createDeferred() {
  let resolve: () => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('fetchBoundedS3Json', () => {
  afterEach(() => jest.restoreAllMocks());

  it('parses a response within the byte limit without following redirects', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ready":true}'));
    const controller = new AbortController();

    await expect(
      fetchBoundedS3Json<{ ready: boolean }>(
        new URL('https://validator.s3.us-east-1.amazonaws.com/checkpoint.json'),
        controller.signal,
        64,
      ),
    ).resolves.toEqual({ ready: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: 'error', signal: controller.signal }),
    );
  });

  it('rejects an advertised response above the byte limit', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        headers: { 'content-length': '1024' },
      }),
    );

    await expect(
      fetchBoundedS3Json(
        new URL('https://validator.s3.us-east-1.amazonaws.com/checkpoint.json'),
        new AbortController().signal,
        64,
      ),
    ).rejects.toThrow('exceeds 64 bytes');
  });

  it('stops streaming a response that crosses the byte limit', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));

    await expect(
      fetchBoundedS3Json(
        new URL('https://validator.s3.us-east-1.amazonaws.com/checkpoint.json'),
        new AbortController().signal,
        2,
      ),
    ).rejects.toThrow('exceeds 2 bytes');
  });

  it('rejects non-AWS targets before fetching', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(
      fetchBoundedS3Json(
        new URL('https://127.0.0.1/checkpoint.json'),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unsafe validator metadata URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('parseS3StorageLocation', () => {
  it('accepts a bounded AWS S3 location', () => {
    expect(parseS3StorageLocation('s3://validator-bucket/us-east-1/checkpoints')).toEqual({
      bucket: 'validator-bucket',
      region: 'us-east-1',
      folder: 'checkpoints',
      caching: true,
    });
  });

  it.each([
    'https://127.0.0.1/checkpoints',
    's3://validator-bucket/../../internal',
    's3://validator-bucket/us-east-1/../internal',
  ])('rejects unsafe storage location %s', (location) => {
    expect(() => parseS3StorageLocation(location)).toThrow();
  });
});

describe('parseValidatorAnnouncement', () => {
  it('accepts the bytes32 mailbox address published by EVM validators', () => {
    expect(
      parseValidatorAnnouncement({
        value: {
          validator: '0x4d966438fe9E2B1e7124c87bBB90cB4F0F6C59a1',
          mailbox_domain: 42161,
          mailbox_address: '0x000000000000000000000000979ca5202784112f4738403dbec5d0f3b9daabb9',
        },
      }),
    ).toEqual({
      address: '0x4d966438fe9E2B1e7124c87bBB90cB4F0F6C59a1',
      localDomain: 42161,
      mailbox: '0x000000000000000000000000979ca5202784112f4738403dbec5d0f3b9daabb9',
    });
  });

  it('rejects malformed validator announcements', () => {
    expect(() =>
      parseValidatorAnnouncement({
        value: {
          validator: 'not-an-address',
          mailbox_domain: 42161,
          mailbox_address: '0x1234',
        },
      }),
    ).toThrow();
  });
});
