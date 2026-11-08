import { useMemo } from 'react';

import { JsonViewer } from '../../../components/JsonViewer';
import { SectionCard } from '../../../components/layout/SectionCard';
import { Message, MessageStub } from '../../../types';
import { decodeAeroVoterMessage } from '../aeroVoter';

export function AeroVoterDetailsCard({
  message,
  blur,
  embedded = false,
}: {
  message: Message | MessageStub;
  blur: boolean;
  embedded?: boolean;
}) {
  const { body, sender, recipient, originDomainId, destinationDomainId } = message;
  const decoded = useMemo(
    () => decodeAeroVoterMessage({ body, sender, recipient, originDomainId, destinationDomainId }),
    [body, sender, recipient, originDomainId, destinationDomainId],
  );

  if (!decoded || blur) return null;

  return (
    <SectionCard embedded={embedded} className="w-full min-w-0" title="Aero V3 message">
      {'error' in decoded ? (
        <p className="text-sm text-gray-700">{decoded.error}</p>
      ) : (
        <JsonViewer value={decoded} label="Decoded Aero V3 message" />
      )}
    </SectionCard>
  );
}
