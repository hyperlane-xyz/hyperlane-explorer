import { useMemo } from 'react';

import { JsonViewer } from '../../../components/JsonViewer';
import type { Message, MessageStub } from '../../../types';
import { decodeEcoMessage } from '../eco';

export function EcoDetailsCard({ message }: { message: Message | MessageStub }) {
  const { originDomainId, sender, recipient, body } = message;
  const decoded = useMemo(
    () => decodeEcoMessage({ originDomainId, sender, recipient, body }),
    [originDomainId, sender, recipient, body],
  );
  if (!decoded) return null;
  return 'error' in decoded ? (
    <p className="text-sm text-gray-700">{decoded.error}</p>
  ) : (
    <JsonViewer value={decoded} label="Decoded Eco message" />
  );
}
