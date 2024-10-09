import Image from 'next/image';

import { isNullish } from '@hyperlane-xyz/utils';

import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import { docLinks } from '../../../consts/links';
import ShieldLock from '../../../images/icons/shield-lock.svg';
import { IsmModuleTypes, MessageDebugResult } from '../../debugger/types';

import { KeyValueRow } from './KeyValueRow';

interface Props {
  ismDetails: MessageDebugResult['ismDetails'];
  blur: boolean;
}

export function IsmDetailsCard({ ismDetails, blur }: Props) {
  return (
    <Card className="w-full space-y-4 relative">
      <div className="flex items-center justify-between">
        <Image src={ShieldLock} width={24} height={24} alt="" className="opacity-80" />
        <div className="flex items-center pb-1">
          <h3 className="text-blue-500 font-medium text-md mr-2">Interchain Security Modules</h3>
          <HelpIcon text="Details about the Interchain Security Modules (ISM) that must verify this message." />
        </div>
      </div>
      <p className="text-sm font-light">
        Interchain Security Modules define the rules for verifying messages before delivery.{' '}
        <a
          href={docLinks.ism}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-blue-500 hover:text-blue-400 active:text-blue-300 transition-all"
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
    </Card>
  );
}

const IsmLabels: Record<IsmModuleTypes, string> = {
  [IsmModuleTypes.UNUSED]: 'Unused',
  [IsmModuleTypes.ROUTING]: 'Routing',
  [IsmModuleTypes.AGGREGATION]: 'Aggregation',
  [IsmModuleTypes.LEGACY_MULTISIG]: 'Legacy Multisig',
  [IsmModuleTypes.MULTISIG]: 'Multisig',
};
