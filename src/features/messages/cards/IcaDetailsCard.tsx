import { Tooltip } from '@hyperlane-xyz/widgets';
import { useMemo } from 'react';
import { SectionCard } from '../../../components/layout/SectionCard';
import { Message } from '../../../types';
import { tryDecodeIcaBody, useIcaAddress } from '../ica';

import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  blur: boolean;
}

export function IcaDetailsCard({ message: { originDomainId, body }, blur }: Props) {
  const decodeResult = useMemo(() => tryDecodeIcaBody(body), [body]);

  const {
    data: icaAddress,
    isFetching,
    isError,
  } = useIcaAddress(originDomainId, decodeResult?.sender);

  return (
    <SectionCard
      className="w-full"
      title="ICA Details"
      icon={
        <Tooltip
          id="ica-info"
          content="Extra information for messages from/to Interchain Accounts."
        />
      }
    >
      {decodeResult ? (
        <>
          <KeyValueRow
            label="Original sender:"
            labelWidth="w-28"
            display={decodeResult.sender}
            displayWidth="w-60 sm:w-80"
            showCopy={true}
            blurValue={blur}
          />
          <KeyValueRow
            label="ICA Address:"
            labelWidth="w-28"
            display={
              icaAddress
                ? icaAddress
                : isFetching
                  ? 'Finding address...'
                  : isError
                    ? 'Error finding address'
                    : 'Unknown address'
            }
            displayWidth="w-60 sm:w-80"
            showCopy={true}
            blurValue={blur}
          />
          {decodeResult.calls.length ? (
            decodeResult.calls.map((c, i) => (
              <div key={`ica-call-${i}`}>
                <label className="text-sm text-gray-500">{`Function call ${i + 1} of ${
                  decodeResult.calls.length
                }:`}</label>
                <div className="mt-2 space-y-2.5 border-l-2 border-gray-400 pl-4">
                  <KeyValueRow
                    label="Destination address:"
                    labelWidth="w-32"
                    display={c.destinationAddress}
                    displayWidth="w-60 sm:w-80"
                    showCopy={true}
                    blurValue={blur}
                  />
                  <KeyValueRow
                    label="Raw call bytes:"
                    labelWidth="w-32"
                    display={c.callBytes}
                    displayWidth="w-60 sm:w-96 lg:w-112"
                    showCopy={true}
                    blurValue={blur}
                  />
                </div>
              </div>
            ))
          ) : (
            <div>
              <label className="text-sm text-gray-500">Call List:</label>
              <div className="mt-1 text-sm italic">No calls found for this message.</div>
            </div>
          )}
        </>
      ) : (
        <div className="py-4 italic text-red-500">
          Unable to decode ICA message body, no details currently available.
        </div>
      )}
    </SectionCard>
  );
}
