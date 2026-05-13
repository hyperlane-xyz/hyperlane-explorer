import { isNullish } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';

import { SectionCard } from '../../../components/layout/SectionCard';
import { docLinks } from '../../../consts/links';
import { IsmModuleTypes, IsmRouteModule, MessageDebugResult } from '../../debugger/types';
import { KeyValueRow } from './KeyValueRow';

interface Props {
  ismDetails: MessageDebugResult['ismDetails'];
  blur: boolean;
}

export function IsmDetailsCard({ ismDetails, blur }: Props) {
  return (
    <SectionCard
      className="w-full"
      title="Interchain Security Modules"
      icon={
        <Tooltip
          id="ism-info"
          content="Details about the Interchain Security Modules (ISM) that must verify this message."
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm font-light">
          Interchain Security Modules define the rules for verifying messages before delivery.{' '}
          <a
            href={docLinks.ism}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer text-primary-600 transition-all hover:text-primary-500 active:text-primary-400"
          >
            Learn more about ISMs.
          </a>
        </p>
        <KeyValueRow
          label="ISM Address:"
          labelWidth="w-24"
          display={ismDetails?.ismAddress || ''}
          showCopy={true}
          blurValue={blur}
        />
        <KeyValueRow
          label="Module Type:"
          labelWidth="w-24"
          display={!isNullish(ismDetails?.moduleType) ? IsmLabels[ismDetails!.moduleType] : ''}
          blurValue={blur}
        />
        {ismDetails?.metadata && (
          <div className="space-y-2 rounded-md bg-gray-50 p-3 dark:bg-gray-900/40">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Process Metadata</p>
            <KeyValueRow
              label="Format:"
              labelWidth="w-28"
              display={formatMetadataLabel(ismDetails.metadata.format)}
              blurValue={blur}
            />
            <KeyValueRow
              label="Length:"
              labelWidth="w-28"
              display={`${ismDetails.metadata.length} bytes`}
              blurValue={blur}
            />
            {ismDetails.metadata.originMerkleTreeHook && (
              <KeyValueRow
                label="Merkle Hook:"
                labelWidth="w-28"
                display={ismDetails.metadata.originMerkleTreeHook}
                showCopy={true}
                blurValue={blur}
                truncateMiddle={true}
              />
            )}
            {!isNullish(ismDetails.metadata.signatureCount) && (
              <KeyValueRow
                label="Signatures:"
                labelWidth="w-28"
                display={ismDetails.metadata.signatureCount.toString()}
                blurValue={blur}
              />
            )}
            {ismDetails.metadata.root && (
              <KeyValueRow
                label="Root:"
                labelWidth="w-28"
                display={ismDetails.metadata.root}
                showCopy={true}
                blurValue={blur}
                truncateMiddle={true}
              />
            )}
            {!isNullish(ismDetails.metadata.index) && (
              <KeyValueRow
                label="Index:"
                labelWidth="w-28"
                display={ismDetails.metadata.index.toString()}
                blurValue={blur}
              />
            )}
            {ismDetails.metadata.signedMessageId && (
              <KeyValueRow
                label="Signed Msg:"
                labelWidth="w-28"
                display={ismDetails.metadata.signedMessageId}
                showCopy={true}
                blurValue={blur}
                truncateMiddle={true}
              />
            )}
            {!isNullish(ismDetails.metadata.signedIndex) && (
              <KeyValueRow
                label="Signed Index:"
                labelWidth="w-28"
                display={ismDetails.metadata.signedIndex.toString()}
                blurValue={blur}
              />
            )}
            <KeyValueRow
              label="Raw:"
              labelWidth="w-28"
              display={ismDetails.metadata.raw}
              showCopy={true}
              blurValue={blur}
              truncateMiddle={true}
            />
          </div>
        )}
        {ismDetails?.route && <IsmRouteTree route={ismDetails.route} blur={blur} />}
      </div>
    </SectionCard>
  );
}

function IsmRouteTree({ route, blur }: { route: IsmRouteModule; blur: boolean }) {
  return (
    <div className="space-y-2 rounded-md bg-gray-50 p-3 dark:bg-gray-900/40">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Security Route</p>
      <IsmRouteNode route={route} blur={blur} depth={0} />
    </div>
  );
}

function IsmRouteNode({
  route,
  blur,
  depth,
}: {
  route: IsmRouteModule;
  blur: boolean;
  depth: number;
}) {
  const labelWidth = depth ? 'w-24' : 'w-28';
  return (
    <div
      className={`${depth ? 'ml-4 border-l border-gray-200 pl-3 dark:border-gray-700' : ''} space-y-2`}
    >
      <KeyValueRow
        label={depth ? 'Module:' : 'Root:'}
        labelWidth={labelWidth}
        display={route.address}
        showCopy={true}
        blurValue={blur}
        truncateMiddle={true}
      />
      {!isNullish(route.moduleType) && (
        <KeyValueRow
          label="Type:"
          labelWidth={labelWidth}
          display={IsmLabels[route.moduleType]}
          blurValue={blur}
        />
      )}
      {!isNullish(route.threshold) && (
        <KeyValueRow
          label="Threshold:"
          labelWidth={labelWidth}
          display={route.threshold.toString()}
          blurValue={blur}
        />
      )}
      {!!route.validators?.length && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500">Validators ({route.validators.length}):</p>
          {route.validators.map((validator) => (
            <KeyValueRow
              key={validator}
              label=""
              labelWidth={labelWidth}
              display={validator}
              showCopy={true}
              blurValue={blur}
              truncateMiddle={true}
            />
          ))}
        </div>
      )}
      {route.children?.map((child) => (
        <IsmRouteNode key={child.address} route={child} blur={blur} depth={depth + 1} />
      ))}
    </div>
  );
}

function formatMetadataLabel(format?: string) {
  if (format === 'messageIdMultisig') return 'Message ID Multisig';
  if (format === 'merkleRootMultisig') return 'Merkle Root Multisig';
  if (format === 'aggregation') return 'Aggregation';
  return 'Unknown';
}

const IsmLabels: Record<IsmModuleTypes, string> = {
  [IsmModuleTypes.UNUSED]: 'Unused',
  [IsmModuleTypes.ROUTING]: 'Routing',
  [IsmModuleTypes.AGGREGATION]: 'Aggregation',
  [IsmModuleTypes.LEGACY_MULTISIG]: 'Legacy Multisig',
  [IsmModuleTypes.MULTISIG]: 'Multisig',
};
