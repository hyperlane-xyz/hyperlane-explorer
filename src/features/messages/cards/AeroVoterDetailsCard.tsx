import { CopyButton } from '@hyperlane-xyz/widgets';
import { useMemo } from 'react';

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
  const json = JSON.stringify(decoded, null, 2);

  return (
    <SectionCard embedded={embedded} className="w-full min-w-0" title="Aero V3 message">
      {'error' in decoded ? (
        <p className="text-sm text-gray-700">{decoded.error}</p>
      ) : (
        <div className="relative min-w-0">
          <CopyButton
            copyValue={json}
            aria-label="Copy decoded JSON"
            title="Copy decoded JSON"
            width={13}
            height={13}
            className="absolute right-0 top-0 rounded p-1 text-gray-500 hover:text-gray-800 [&_rect]:stroke-current [&_path]:fill-current"
          />
          <pre
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Allow keyboard scrolling of the JSON output.
            tabIndex={0}
            aria-label="Decoded Aero V3 message"
            className="max-h-[32rem] overflow-auto pr-8 font-mono text-xs leading-[1.5] text-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            <code>
              {json
                .split(
                  /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
                )
                .map((token, index) => (
                  <span
                    key={index}
                    className={
                      token.startsWith('"')
                        ? token.endsWith(':')
                          ? 'text-primary-700'
                          : 'text-green-700'
                        : /^(true|false|null)$/.test(token)
                          ? 'text-blue-700'
                          : /^-?\d/.test(token)
                            ? 'text-amber-700'
                            : undefined
                    }
                  >
                    {token}
                  </span>
                ))}
            </code>
          </pre>
        </div>
      )}
    </SectionCard>
  );
}
