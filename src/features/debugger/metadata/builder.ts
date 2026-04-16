import {
  HookType,
  type HyperlaneCore,
  IsmType,
  type MerkleTreeHookConfig,
} from '@hyperlane-xyz/sdk';
import { deepFind, type WithAddress } from '@hyperlane-xyz/utils';

import type {
  BaseMetadataBuildResult,
  MetadataBuildResult,
  MetadataBuilder,
  MetadataContext,
} from '../metadataTypes';
import { AggregationMetadataBuilder } from './aggregation';
import { MultisigMetadataBuilder } from './multisig';
import { NullMetadataBuilder } from './null';
import { DynamicRoutingMetadataBuilder } from './routing';

export class BaseMetadataBuilder implements MetadataBuilder {
  public readonly nullMetadataBuilder: NullMetadataBuilder;
  public readonly multisigMetadataBuilder: MultisigMetadataBuilder;
  public readonly aggregationMetadataBuilder: AggregationMetadataBuilder;
  public readonly routingMetadataBuilder: DynamicRoutingMetadataBuilder;
  public readonly multiProvider;

  constructor(core: HyperlaneCore) {
    this.multisigMetadataBuilder = new MultisigMetadataBuilder(core);
    this.aggregationMetadataBuilder = new AggregationMetadataBuilder(this);
    this.routingMetadataBuilder = new DynamicRoutingMetadataBuilder(this);
    this.nullMetadataBuilder = new NullMetadataBuilder();
    this.multiProvider = core.multiProvider;
  }

  async build(context: MetadataContext, maxDepth = 10): Promise<MetadataBuildResult> {
    if (maxDepth <= 0) return this.baseResult(context);

    const { ism, hook } = context;
    switch (ism.type) {
      case IsmType.TRUSTED_RELAYER:
      case IsmType.TEST_ISM:
      case IsmType.OP_STACK:
      case IsmType.PAUSABLE:
      case IsmType.CCIP:
        return this.nullMetadataBuilder.build({ ...context, ism });

      case IsmType.MESSAGE_ID_MULTISIG:
      case IsmType.STORAGE_MESSAGE_ID_MULTISIG:
      case IsmType.MERKLE_ROOT_MULTISIG:
      case IsmType.STORAGE_MERKLE_ROOT_MULTISIG: {
        if (typeof hook === 'string') {
          throw new Error('Hook context must be an object for multisig ISM');
        }
        const merkleTreeHook = deepFind(
          hook,
          (value): value is WithAddress<MerkleTreeHookConfig> =>
            value.type === HookType.MERKLE_TREE && !!value.address,
        );
        if (!merkleTreeHook) {
          throw new Error('Merkle tree hook context not found');
        }
        return this.multisigMetadataBuilder.build({
          ...context,
          ism,
          hook: merkleTreeHook,
        });
      }

      case IsmType.ROUTING:
      case IsmType.FALLBACK_ROUTING:
      case IsmType.AMOUNT_ROUTING:
      case IsmType.INTERCHAIN_ACCOUNT_ROUTING:
        return this.routingMetadataBuilder.build({ ...context, ism }, maxDepth);

      case IsmType.AGGREGATION:
      case IsmType.STORAGE_AGGREGATION:
        return this.aggregationMetadataBuilder.build({ ...context, ism }, maxDepth);

      case IsmType.ARB_L2_TO_L1:
      case IsmType.OFFCHAIN_LOOKUP:
      default:
        return this.baseResult(context);
    }
  }

  private baseResult(context: MetadataContext): BaseMetadataBuildResult {
    return {
      type: context.ism.type,
      ismAddress: (context.ism as { address: string }).address,
    };
  }
}
