import { AsyncLocalStorage } from 'node:async_hooks';

import { StaticAggregationIsm__factory } from '@hyperlane-xyz/core';
import {
  type AggregationIsmConfig,
  type DerivedIsmConfig,
  type DispatchedMessage,
  EvmIsmReader,
  type IsmConfig,
  IsmType,
  ModuleType,
  type MultisigIsmConfig,
  type MultiProvider,
  type OffchainLookupIsmConfig,
} from '@hyperlane-xyz/sdk';
import { concurrentMap, type Address, type WithAddress } from '@hyperlane-xyz/utils';
import { constants } from 'ethers';

export const SELF_RELAY_ISM_REJECTION = 'SELF_RELAY_ISM_REJECTION';
export const SELF_RELAY_ISM_UNSUPPORTED = 'SELF_RELAY_ISM_UNSUPPORTED';

const SUPPORTED_LEAF_ISM_TYPES = new Set<string>([
  IsmType.MESSAGE_ID_MULTISIG,
  IsmType.STORAGE_MESSAGE_ID_MULTISIG,
  IsmType.TEST_ISM,
  IsmType.OP_STACK,
  IsmType.PAUSABLE,
  IsmType.CCIP,
  IsmType.RATE_LIMITED,
]);

export interface IsmTraversalLimits {
  maxDepth: number;
  maxFanout: number;
  maxModules: number;
  maxValidators: number;
  deadline: number;
}

interface TraversalContext {
  depth: number;
  path: ReadonlySet<string>;
}

export class IsmTraversalGuard {
  private readonly context = new AsyncLocalStorage<TraversalContext>();
  private moduleCount = 0;

  constructor(private readonly limits: IsmTraversalLimits) {}

  async visit<T>(address: Address, operation: () => Promise<T>): Promise<T> {
    this.assertWithinDeadline();
    const parent = this.context.getStore() ?? { depth: 0, path: new Set<string>() };
    const normalizedAddress = address.toLowerCase();

    if (parent.depth >= this.limits.maxDepth) {
      throw this.rejection(`ISM graph exceeds depth ${this.limits.maxDepth}`);
    }
    if (parent.path.has(normalizedAddress)) {
      throw this.rejection(`ISM graph contains a cycle at ${address}`);
    }

    this.moduleCount += 1;
    if (this.moduleCount > this.limits.maxModules) {
      throw this.rejection(`ISM graph exceeds ${this.limits.maxModules} modules`);
    }

    return this.context.run(
      {
        depth: parent.depth + 1,
        path: new Set([...parent.path, normalizedAddress]),
      },
      operation,
    );
  }

  assertFanout(moduleCount: number) {
    if (moduleCount > this.limits.maxFanout) {
      throw this.rejection(`ISM aggregation exceeds fanout ${this.limits.maxFanout}`);
    }
  }

  normalizeValidators(validators: Address[], threshold: number): Address[] {
    if (validators.length > this.limits.maxValidators) {
      throw this.rejection(`Multisig ISM exceeds ${this.limits.maxValidators} validators`);
    }

    const uniqueValidators = new Map<string, Address>();
    for (const validator of validators) {
      uniqueValidators.set(validator.toLowerCase(), validator);
    }
    if (threshold <= 0 || threshold > uniqueValidators.size) {
      throw this.rejection(
        `Multisig ISM threshold ${threshold} exceeds ${uniqueValidators.size} unique validators`,
      );
    }

    return [...uniqueValidators.values()];
  }

  private assertWithinDeadline() {
    if (Date.now() >= this.limits.deadline) {
      throw this.rejection('ISM derivation deadline exceeded');
    }
  }

  private rejection(message: string) {
    return new Error(`${SELF_RELAY_ISM_REJECTION}: ${message}`);
  }
}

export class BoundedEvmIsmReader extends EvmIsmReader {
  private readonly guard: IsmTraversalGuard;

  constructor(
    multiProvider: MultiProvider,
    chain: string,
    message: DispatchedMessage,
    limits: IsmTraversalLimits,
  ) {
    super(multiProvider, chain, Math.min(limits.maxFanout, 4), message);
    this.guard = new IsmTraversalGuard(limits);
  }

  override deriveIsmConfigFromAddress(address: Address): Promise<DerivedIsmConfig> {
    return this.guard.visit(address, async () => {
      try {
        return await super.deriveIsmConfigFromAddress(address);
      } catch (error) {
        if (isUnsupportedModuleTypeError(error)) throw unsupportedIsm(address);
        throw error;
      }
    });
  }

  override async deriveAggregationConfig(
    address: Address,
  ): Promise<WithAddress<AggregationIsmConfig>> {
    const ism = StaticAggregationIsm__factory.connect(address, this.provider);
    this.assertModuleType(await ism.moduleType(), ModuleType.AGGREGATION);
    const [modules, threshold] = await ism.modulesAndThreshold(constants.AddressZero);
    this.guard.assertFanout(modules.length);
    const moduleConfigs = await concurrentMap(this.concurrency, modules, async (module) => {
      const derived = await this.deriveIsmConfigFromAddress(module);
      return derived.type === IsmType.INTERCHAIN_ACCOUNT_ROUTING ? module : derived;
    });

    return {
      address,
      type: this.isZkSyncChain ? IsmType.STORAGE_AGGREGATION : IsmType.AGGREGATION,
      modules: moduleConfigs,
      threshold,
    };
  }

  override async deriveOffchainLookupConfig(
    address: Address,
  ): Promise<WithAddress<OffchainLookupIsmConfig>> {
    throw unsupportedIsm(address, IsmType.OFFCHAIN_LOOKUP);
  }

  override async deriveMultisigConfig(address: Address): Promise<WithAddress<MultisigIsmConfig>> {
    const config = await super.deriveMultisigConfig(address);
    return {
      ...config,
      validators: this.guard.normalizeValidators(config.validators, config.threshold),
    };
  }
}

export function isSelfRelayIsmRejection(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes(SELF_RELAY_ISM_REJECTION) ||
      error.message.includes(SELF_RELAY_ISM_UNSUPPORTED))
  );
}

export function isUnsupportedSelfRelayIsm(error: unknown): boolean {
  return error instanceof Error && error.message.includes(SELF_RELAY_ISM_UNSUPPORTED);
}

export function assertSelfRelayIsmSupported(ism: IsmConfig): void {
  if (typeof ism === 'string') throw unsupportedIsm(ism);
  if (SUPPORTED_LEAF_ISM_TYPES.has(ism.type)) return;

  if (ism.type === IsmType.AGGREGATION || ism.type === IsmType.STORAGE_AGGREGATION) {
    for (const nestedIsm of ism.modules) assertSelfRelayIsmSupported(nestedIsm);
    return;
  }

  throw unsupportedIsm('address' in ism ? ism.address : 'unknown', ism.type);
}

function unsupportedIsm(address: string, type?: string): Error {
  const label = type ? `${type} ISM` : 'ISM';
  return new Error(`${SELF_RELAY_ISM_UNSUPPORTED}: ${label} ${address} is not supported`);
}

function isUnsupportedModuleTypeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Unknown ISM ModuleType') ||
    error.message.includes('UNUSED does not have a corresponding IsmType') ||
    error.message.includes('LEGACY_MULTISIG is deprecated')
  );
}
