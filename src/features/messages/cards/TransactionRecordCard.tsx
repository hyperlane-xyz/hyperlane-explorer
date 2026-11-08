import { Tooltip } from '@hyperlane-xyz/widgets';
import { useId, type PropsWithChildren } from 'react';

import { ChainLogo } from '../../../components/icons/ChainLogo';
import { useChainMetadataResolver } from '../../../metadataStore';
import { getChainDisplayName } from '../../chains/utils';

export function TransactionRecordCard({
  chainName,
  domainId,
  title,
  helpText,
  children,
}: PropsWithChildren<{
  chainName: string;
  domainId: DomainId;
  title: string;
  helpText: string;
}>) {
  const resolver = useChainMetadataResolver();
  const tooltipId = `${useId()}-transaction-info`;
  return (
    <section className="shadow-card flex min-w-0 flex-1 basis-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white sm:basis-0">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-gray-150 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white/70">
          <ChainLogo chainName={chainName} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">{title}</p>
          <h3 className="mt-0.5 text-sm font-medium text-gray-800">
            {getChainDisplayName(resolver, chainName, false, false)}
            <span className="ml-2 text-xxs font-normal text-gray-500" title="Hyperlane domain ID">
              {domainId}
            </span>
          </h3>
        </div>
        <Tooltip id={tooltipId} content={helpText} />
      </header>
      <div className="min-w-0 space-y-4 p-4">{children}</div>
    </section>
  );
}

export const transactionHelpText = {
  origin: 'The origin transaction dispatched this message. IGP payments fund its delivery.',
  destination: 'The delivery transaction executed this message on the destination chain.',
};
