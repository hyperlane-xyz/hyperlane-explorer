import { CopyButton } from '@hyperlane-xyz/widgets';
import { useMemo } from 'react';

import { SectionCard } from '../../../components/layout/SectionCard';
import { Message, MessageStub } from '../../../types';
import { getDateTimeString } from '../../../utils/time';
import { AeroVoterFields, decodeAeroVoterMessage } from '../aeroVoter';
import { KeyValueRow } from './KeyValueRow';

export function AeroVoterDetailsCard({
  message,
  blur,
}: {
  message: Message | MessageStub;
  blur: boolean;
}) {
  const { body, sender, recipient, originDomainId, destinationDomainId } = message;
  const decoded = useMemo(
    () => decodeAeroVoterMessage({ body, sender, recipient, originDomainId, destinationDomainId }),
    [body, sender, recipient, originDomainId, destinationDomainId],
  );

  if (!decoded || blur) return null;

  return (
    <SectionCard className="w-full min-w-0" title="Decoded Message Payload · Aero V3 Voter">
      {'error' in decoded ? (
        <p className="text-sm text-gray-700">{decoded.error}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KeyValueRow
              label="Type:"
              labelWidth="w-28"
              display={`${decoded.messageTypeName} (${decoded.messageType})`}
            />
            <KeyValueRow
              label="Chain nonce:"
              labelWidth="w-28"
              display={decoded.chainNonce}
              showCopy
              allowZeroish
            />
            <KeyValueRow
              label="Dispatched:"
              labelWidth="w-28"
              display={getDateTimeString(Number(decoded.dispatchedAt) * 1000)}
              copyValue={decoded.dispatchedAt}
              showCopy
            />
          </div>
          <p className="text-xs text-gray-500">
            Amounts are shown in raw base units. Copy timestamps to get Unix seconds.
          </p>
          <DecodedFields fields={decoded.payload} />
          <details>
            <summary className="cursor-pointer text-sm text-gray-500">Decoded JSON</summary>
            <div className="relative mt-2 rounded bg-gray-100 p-3 pr-9">
              <pre className="text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(decoded, null, 2)}
              </pre>
              <CopyButton
                copyValue={JSON.stringify(decoded, null, 2)}
                width={12}
                height={12}
                className="absolute top-3 right-3 opacity-60"
              />
            </div>
          </details>
        </div>
      )}
    </SectionCard>
  );
}

function DecodedFields({ fields }: { fields: AeroVoterFields }) {
  return (
    <div className="space-y-3">
      {Object.entries(fields).map(([name, value]) => (
        <div key={name}>
          {typeof value === 'string' || typeof value === 'boolean' ? (
            <KeyValueRow
              label={`${fieldLabels[name] ?? name}:`}
              labelWidth="w-36 sm:w-48"
              display={
                typeof value === 'boolean'
                  ? value
                    ? 'True'
                    : 'False'
                  : name === 'stakeEnd' && fields.isPermanent === true
                    ? 'Permanent'
                    : name === 'expiry' || name === 'stakeEnd'
                      ? getDateTimeString(Number(value) * 1000)
                      : value
              }
              copyValue={String(value)}
              showCopy
              allowZeroish
            />
          ) : (
            <div className="space-y-2 rounded border border-gray-200 p-3">
              <h3 className="text-sm font-medium text-gray-700">
                {fieldLabels[name] ?? name}
                {Array.isArray(value) && ` (${value.length})`}
              </h3>
              {Array.isArray(value) ? (
                value.length ? (
                  value.map((entry, index) => (
                    <div key={index} className="border-l-2 border-gray-200 pl-3">
                      <p className="mb-2 text-xs text-gray-500">#{index + 1}</p>
                      {typeof entry === 'object' && !Array.isArray(entry) ? (
                        <DecodedFields fields={entry} />
                      ) : (
                        <span className="text-sm">{String(entry)}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">None</p>
                )
              ) : (
                <DecodedFields fields={value} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const fieldLabels: Record<string, string> = {
  tokenId: 'Token ID',
  allocationDelta: 'Allocation delta',
  emissionsPerVP: 'Emissions per VP',
  snapshot: 'Token snapshot',
  tokenSnapshot: 'Token snapshot',
  staked: 'Staked amount',
  stakeEnd: 'Stake end',
  isPermanent: 'Permanent stake',
  expiry: 'Expiry',
  allocations: 'Gauge allocations',
  gauge: 'Gauge',
  allocated: 'Allocated amount',
  data: 'Gauge data',
  amount: 'Amount',
  recipient: 'Recipient',
  surplusAccrued: 'Surplus accrued',
  operator: 'Operator',
  reduction: 'Cooldown reduction (s)',
  feeClaims: 'Fee claims',
  incentiveClaims: 'Incentive claims',
  votingRewardsManager: 'Rewards manager',
  maxCheckpoints: 'Max checkpoints',
  programId: 'Program ID',
};
