import type { ChainMap, ChainMetadata } from '@hyperlane-xyz/sdk';
import { ProtocolType } from '@hyperlane-xyz/utils';
import { BigNumber } from 'ethers';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TOKEN_ADDRESS = '0xtoken0000000000000000000000000000000000a';
const ISM_ADDRESS = '0xism00000000000000000000000000000000000010';
const MAILBOX_ADDRESS = '0xmailbox000000000000000000000000000000020';
const DEFAULT_ISM_ADDRESS = '0xdefism0000000000000000000000000000000030';
const OWNER_EOA = '0xowner0000000000000000000000000000000000040';
const OWNER_SAFE = '0xsafe00000000000000000000000000000000000050';

const mailboxClientMock = jest.fn();
const mailboxFactoryMock = jest.fn();
const safeFactoryMock = jest.fn();
const ethersContractMock = jest.fn();
const walkIsmMock = jest.fn();

jest.mock('@hyperlane-xyz/core', () => ({
  MailboxClient__factory: {
    connect: (...args: unknown[]) => mailboxClientMock(...args),
  },
  Mailbox__factory: {
    connect: (...args: unknown[]) => mailboxFactoryMock(...args),
  },
  ISafe__factory: {
    connect: (...args: unknown[]) => safeFactoryMock(...args),
  },
}));

jest.mock('./walkIsm', () => {
  class IsmWalkAbortError extends Error {
    constructor() {
      super('aborted');
      this.name = 'IsmWalkAbortError';
    }
  }
  return {
    walkIsm: (...args: unknown[]) => walkIsmMock(...args),
    IsmWalkAbortError,
  };
});

jest.mock('@hyperlane-xyz/sdk', () => ({
  MultiProvider: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: jest.fn().mockImplementation((...args: unknown[]) => ethersContractMock(...args)),
    },
  };
});

import { fetchWarpRouteIsm } from './fetchWarpRouteIsm';

function evmMetadata(name: string): ChainMetadata {
  return {
    name,
    chainId: 1,
    domainId: 1,
    protocol: ProtocolType.Ethereum,
    rpcUrls: [{ http: 'http://example' }],
  } as ChainMetadata;
}

function nonEvmMetadata(name: string, protocol: ProtocolType): ChainMetadata {
  return {
    name,
    chainId: 1,
    domainId: 1,
    protocol,
    rpcUrls: [{ http: 'http://example' }],
  } as ChainMetadata;
}

const chainMetadata: ChainMap<ChainMetadata> = {
  ethereum: evmMetadata('ethereum'),
  arbitrum: evmMetadata('arbitrum'),
  injective: nonEvmMetadata('injective', ProtocolType.Cosmos),
};

const fakeProvider = {} as never;
const providers = {
  ethereum: fakeProvider,
  arbitrum: fakeProvider,
  injective: fakeProvider,
};

beforeEach(() => {
  mailboxClientMock.mockReset();
  mailboxFactoryMock.mockReset();
  safeFactoryMock.mockReset();
  ethersContractMock.mockReset();
  walkIsmMock.mockReset();
});

function setupRouterReads(opts: { ism: string; mailbox: string; owner: string }) {
  mailboxClientMock.mockReturnValue({
    interchainSecurityModule: () => Promise.resolve(opts.ism),
    mailbox: () => Promise.resolve(opts.mailbox),
    owner: () => Promise.resolve(opts.owner),
  });
}

function setupWalkSuccess(tree: object) {
  walkIsmMock.mockResolvedValue(tree);
}

function setupWalkFailure(message: string) {
  walkIsmMock.mockRejectedValue(new Error(message));
}

function setupSafeYes(threshold: number, owners?: string[]) {
  safeFactoryMock.mockReturnValue({
    getThreshold: () => Promise.resolve(BigNumber.from(threshold)),
    nonce: () => Promise.resolve(BigNumber.from(0)),
  });
  if (owners) {
    ethersContractMock.mockReturnValue({
      getOwners: jest.fn().mockResolvedValue(owners),
    });
  } else {
    ethersContractMock.mockReturnValue({
      getOwners: jest.fn().mockRejectedValue(new Error('no getOwners')),
    });
  }
}

function setupSafeNo() {
  safeFactoryMock.mockReturnValue({
    getThreshold: () => Promise.reject(new Error('not a safe')),
    nonce: () => Promise.reject(new Error('not a safe')),
  });
}

describe('fetchWarpRouteIsm', () => {
  it('returns unsupported for non-EVM chains', async () => {
    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'injective', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('unsupported');
    if (result.origin.kind === 'unsupported') {
      expect(result.origin.protocol).toBe(ProtocolType.Cosmos);
    }
  });

  it('returns error when chain metadata missing', async () => {
    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'unknown-chain', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('error');
  });

  it('uses token-configured ISM when non-zero', async () => {
    setupRouterReads({ ism: ISM_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_EOA });
    setupWalkSuccess({ address: ISM_ADDRESS, moduleType: 5, typeLabel: 'Message ID Multisig' });
    setupSafeNo();

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('data');
    if (result.origin.kind === 'data') {
      expect(result.origin.value.ismAddress).toBe(ISM_ADDRESS);
      expect(result.origin.value.ismSource).toBe('token');
      expect(mailboxFactoryMock).not.toHaveBeenCalled();
    }
  });

  it('falls back to mailbox default ISM when token ISM is zero', async () => {
    setupRouterReads({ ism: ZERO_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_EOA });
    mailboxFactoryMock.mockReturnValue({
      defaultIsm: () => Promise.resolve(DEFAULT_ISM_ADDRESS),
    });
    setupWalkSuccess({
      address: DEFAULT_ISM_ADDRESS,
      moduleType: 5,
      typeLabel: 'Message ID Multisig',
    });
    setupSafeNo();

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('data');
    if (result.origin.kind === 'data') {
      expect(result.origin.value.ismAddress).toBe(DEFAULT_ISM_ADDRESS);
      expect(result.origin.value.ismSource).toBe('mailbox-default');
    }
  });

  it('detects EOA owner when Safe calls revert', async () => {
    setupRouterReads({ ism: ISM_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_EOA });
    setupWalkSuccess({ address: ISM_ADDRESS, moduleType: 5, typeLabel: 'Message ID Multisig' });
    setupSafeNo();

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('data');
    if (result.origin.kind === 'data') {
      expect(result.origin.value.ownerKind).toBe('eoa');
      expect(result.origin.value.safeInfo).toBeUndefined();
    }
  });

  it('detects Safe owner with threshold and owner count', async () => {
    setupRouterReads({ ism: ISM_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_SAFE });
    setupWalkSuccess({ address: ISM_ADDRESS, moduleType: 5, typeLabel: 'Message ID Multisig' });
    setupSafeYes(2, ['0x1', '0x2', '0x3']);

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('data');
    if (result.origin.kind === 'data') {
      expect(result.origin.value.ownerKind).toBe('safe');
      expect(result.origin.value.safeInfo).toEqual({ threshold: 2, ownerCount: 3 });
    }
  });

  it('keeps Safe detection when getOwners is unavailable', async () => {
    setupRouterReads({ ism: ISM_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_SAFE });
    setupWalkSuccess({ address: ISM_ADDRESS, moduleType: 5, typeLabel: 'Message ID Multisig' });
    setupSafeYes(1);

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('data');
    if (result.origin.kind === 'data') {
      expect(result.origin.value.ownerKind).toBe('safe');
      expect(result.origin.value.safeInfo).toEqual({ threshold: 1, ownerCount: 0 });
    }
  });

  it('returns ismError when walker throws but keeps owner data', async () => {
    setupRouterReads({ ism: ISM_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_EOA });
    setupWalkFailure('walk failed');
    setupSafeNo();

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('data');
    if (result.origin.kind === 'data') {
      expect(result.origin.value.ismTree).toBeNull();
      expect(result.origin.value.ismError).toContain('walk failed');
      expect(result.origin.value.owner).toBe(OWNER_EOA);
    }
  });

  it('isolates per-side errors', async () => {
    mailboxClientMock.mockImplementationOnce(() => {
      throw new Error('rpc dead');
    });
    setupRouterReads({ ism: ISM_ADDRESS, mailbox: MAILBOX_ADDRESS, owner: OWNER_EOA });
    setupWalkSuccess({ address: ISM_ADDRESS, moduleType: 5, typeLabel: 'Message ID Multisig' });
    setupSafeNo();

    const result = await fetchWarpRouteIsm({
      chainMetadata,
      providers,
      origin: { chainName: 'ethereum', tokenAddress: TOKEN_ADDRESS },
      destination: { chainName: 'arbitrum', tokenAddress: TOKEN_ADDRESS },
    });

    expect(result.origin.kind).toBe('error');
    expect(result.destination.kind).toBe('data');
  });
});
