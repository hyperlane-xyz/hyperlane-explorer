import { MerkleTreeHook__factory } from '@hyperlane-xyz/core';
import {
  type ChainName,
  type HyperlaneCore,
  IsmType,
  type MerkleTreeHookConfig,
  type MultisigIsmConfig,
  S3Validator,
  defaultMultisigConfigs,
} from '@hyperlane-xyz/sdk';
import {
  type Address,
  type Checkpoint,
  type S3CheckpointWithId,
  type SignatureLike,
  type WithAddress,
  assert,
  bytes32ToAddress,
  eqAddress,
  eqAddressEvm,
  mapAllSettled,
  strip0x,
  toHexString,
} from '@hyperlane-xyz/utils';
import { joinSignature } from 'ethers/lib/utils';

import {
  type MetadataBuilder,
  type MetadataContext,
  type MultisigMetadataBuildResult,
  type ValidatorInfo,
  ValidatorStatus,
} from '../metadataTypes';

interface MessageIdMultisigMetadata {
  checkpoint: Omit<Checkpoint, 'mailbox_domain'>;
  signatures: SignatureLike[];
}

const merkleTreeInterface = MerkleTreeHook__factory.createInterface();

export class MultisigMetadataBuilder implements MetadataBuilder {
  private validatorCache: Record<ChainName, Record<string, S3Validator | undefined>> = {};

  constructor(private readonly core: HyperlaneCore) {}

  private getValidatorAlias(validatorAddress: Address, chain: ChainName): string | undefined {
    const config = defaultMultisigConfigs[chain];
    return config?.validators.find((validator) => eqAddress(validator.address, validatorAddress))
      ?.alias;
  }

  private async s3Validators(
    originChain: ChainName,
    validators: string[],
  ): Promise<(S3Validator | undefined)[]> {
    this.validatorCache[originChain] ??= {};
    const toFetch = validators.filter(
      (validator) => !(validator in this.validatorCache[originChain]),
    );

    if (toFetch.length > 0) {
      const validatorAnnounce = this.core.getContracts(originChain).validatorAnnounce;
      const storageLocations = await validatorAnnounce.getAnnouncedStorageLocations(toFetch);
      const { fulfilled } = await mapAllSettled(storageLocations, async (locations) => {
        const latestLocation = locations.slice(-1)[0];
        if (!latestLocation) throw new Error('No storage location announced');
        return S3Validator.fromStorageLocation(latestLocation);
      });

      toFetch.forEach((validator, index) => {
        this.validatorCache[originChain][validator] = fulfilled.get(index);
      });
    }

    return validators.map((validator) => this.validatorCache[originChain][validator]);
  }

  private checkpointMatches(
    checkpoint: S3CheckpointWithId,
    match: { origin: number; merkleTree: Address; messageId: string; index: number },
  ): boolean {
    return (
      eqAddress(
        bytes32ToAddress(checkpoint.value.checkpoint.merkle_tree_hook_address),
        match.merkleTree,
      ) &&
      checkpoint.value.message_id === match.messageId &&
      checkpoint.value.checkpoint.index === match.index &&
      checkpoint.value.checkpoint.mailbox_domain === match.origin
    );
  }

  private async fetchValidatorCheckpoints(
    validators: Address[],
    match: { origin: number; merkleTree: Address; messageId: string; index: number },
  ): Promise<{
    originChain: ChainName;
    fulfilled: Map<number, S3CheckpointWithId | void>;
    rejected: Map<number, Error>;
  }> {
    const originChain = this.core.multiProvider.getChainName(match.origin);
    const s3Validators = await this.s3Validators(originChain, validators);

    const { fulfilled, rejected } = await mapAllSettled(validators, async (_, index) => {
      const s3Validator = s3Validators[index];
      if (!s3Validator) throw new Error('No valid storage location for validator');
      return s3Validator.getCheckpoint(match.index);
    });

    return { originChain, fulfilled, rejected };
  }

  private async getValidatorInfos(
    validators: Address[],
    match: { origin: number; merkleTree: Address; messageId: string; index: number },
  ): Promise<{ validatorInfos: ValidatorInfo[]; checkpoint?: Checkpoint }> {
    const { originChain, fulfilled, rejected } = await this.fetchValidatorCheckpoints(
      validators,
      match,
    );

    let firstMatchingCheckpoint: Checkpoint | undefined;

    const validatorInfos = validators.map((address, index) => {
      const alias = this.getValidatorAlias(address, originChain);

      if (rejected.has(index)) {
        return {
          address,
          alias,
          status: ValidatorStatus.Error,
          error: `Failed to fetch checkpoint: ${rejected.get(index)?.message}`,
        } satisfies ValidatorInfo;
      }

      const checkpoint = fulfilled.get(index);
      if (!checkpoint || !this.checkpointMatches(checkpoint, match)) {
        return {
          address,
          alias,
          status: ValidatorStatus.Pending,
        } satisfies ValidatorInfo;
      }

      if (!firstMatchingCheckpoint) {
        firstMatchingCheckpoint = checkpoint.value.checkpoint;
      }

      return {
        address,
        alias,
        status: ValidatorStatus.Signed,
        signature: checkpoint.signature,
        checkpointIndex: checkpoint.value.checkpoint.index,
      } satisfies ValidatorInfo;
    });

    return { validatorInfos, checkpoint: firstMatchingCheckpoint };
  }

  async build(
    context: MetadataContext<WithAddress<MultisigIsmConfig>, WithAddress<MerkleTreeHookConfig>>,
  ): Promise<MultisigMetadataBuildResult> {
    assert(
      context.ism.type === IsmType.MESSAGE_ID_MULTISIG ||
        context.ism.type === IsmType.STORAGE_MESSAGE_ID_MULTISIG,
      'Merkle proof multisig is not supported in explorer',
    );

    const merkleTree = context.hook.address;
    const matchingInsertion = context.dispatchTx.logs
      .filter((log) => eqAddressEvm(log.address, merkleTree))
      .map((log) => merkleTreeInterface.parseLog(log))
      .find((event) => event.args.messageId === context.message.id);

    assert(
      matchingInsertion,
      `No merkle tree insertion of ${context.message.id} to ${merkleTree} found in dispatch tx`,
    );

    const checkpointIndex = matchingInsertion.args.index;
    const { validatorInfos, checkpoint } = await this.getValidatorInfos(context.ism.validators, {
      origin: context.message.parsed.origin,
      merkleTree,
      messageId: context.message.id,
      index: checkpointIndex,
    });

    const result: MultisigMetadataBuildResult = {
      type: context.ism.type,
      ismAddress: context.ism.address,
      threshold: context.ism.threshold,
      validators: validatorInfos,
      checkpointIndex,
    };

    const signedValidators = validatorInfos.filter(
      (validator) => validator.status === ValidatorStatus.Signed,
    );

    if (signedValidators.length >= context.ism.threshold && checkpoint) {
      result.metadata = MultisigMetadataBuilder.encode({
        checkpoint,
        signatures: signedValidators
          .map((validator) => validator.signature!)
          .slice(0, context.ism.threshold),
      });
    }

    return result;
  }

  private static encode({ checkpoint, signatures }: MessageIdMultisigMetadata): string {
    const buf = Buffer.alloc(68);
    buf.write(strip0x(checkpoint.merkle_tree_hook_address), 0, 32, 'hex');
    buf.write(strip0x(checkpoint.root), 32, 32, 'hex');
    buf.writeUInt32BE(checkpoint.index, 64);

    let encoded = toHexString(buf);
    signatures.forEach((signature) => {
      encoded += strip0x(joinSignature(signature));
    });
    return encoded;
  }
}
