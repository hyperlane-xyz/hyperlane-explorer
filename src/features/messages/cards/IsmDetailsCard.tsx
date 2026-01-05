import { isNullish } from '@hyperlane-xyz/utils';
import { Tooltip } from '@hyperlane-xyz/widgets';
import { SectionCard } from '../../../components/layout/SectionCard';
import { docLinks } from '../../../consts/links';
import { IsmModuleTypes, MessageDebugResult } from '../../debugger/types';

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
      </div>
    </SectionCard>
  );
}

const IsmLabels: Record<IsmModuleTypes, string> = {
  [IsmModuleTypes.UNUSED]: 'Unused',
  [IsmModuleTypes.ROUTING]: 'Routing',
  [IsmModuleTypes.AGGREGATION]: 'Aggregation',
  [IsmModuleTypes.LEGACY_MULTISIG]: 'Legacy Multisig',
  [IsmModuleTypes.MULTISIG]: 'Multisig',
};
