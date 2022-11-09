import { useMemo } from 'react';

import { HelpIcon } from '../../../components/icons/HelpIcon';
import { InterchainAccount } from '../../../components/icons/InterchainAccount';
import { Card } from '../../../components/layout/Card';
import { Message } from '../../../types';
import { tryDecodeIcaBody, useIcaAddress } from '../ica';

import { KeyValueRow } from './KeyValueRow';

interface Props {
  message: Message;
  shouldBlur: boolean;
}

export function IcaDetailsCard({ message: { originDomainId, body }, shouldBlur }: Props) {
  const decodeResult = useMemo(() => tryDecodeIcaBody(body), [body]);

  const {
    data: icaAddress,
    isFetching,
    isError,
  } = useIcaAddress(originDomainId, decodeResult?.sender);

  return (
    <Card classes="mt-2 space-y-4" width="w-full">
      <div className="flex items-center justify-between">
        <div className="relative -top-px -left-0.5">
          <InterchainAccount />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="text-gray-500 font-medium text-md mr-2">ICA Details</h3>
          <HelpIcon size={16} text="Extra information for messages from/to Interchain Accounts." />
        </div>
      </div>
      {decodeResult ? (
        <>
          <KeyValueRow
            label="Original sender:"
            labelWidth="w-28"
            display={decodeResult.sender}
            displayWidth="w-60 sm:w-80"
            showCopy={true}
            blurValue={shouldBlur}
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
            blurValue={shouldBlur}
          />
          {decodeResult.calls.length ? (
            decodeResult.calls.map((c, i) => (
              <div key={`ica-call-${i}`}>
                <label className="text-sm text-gray-500">{`Function call ${i + 1} of ${
                  decodeResult.calls.length
                }:`}</label>
                <div className="mt-2 pl-4 border-l-2 border-gray-400 space-y-2.5">
                  <KeyValueRow
                    label="Destination address:"
                    labelWidth="w-32"
                    display={c.destinationAddress}
                    displayWidth="w-60 sm:w-80"
                    showCopy={true}
                    blurValue={shouldBlur}
                  />
                  <KeyValueRow
                    label="Raw call bytes:"
                    labelWidth="w-32"
                    display={c.callBytes}
                    displayWidth="w-60 sm:w-96 lg:w-112"
                    showCopy={true}
                    blurValue={shouldBlur}
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
        <div className="py-4 text-red-500 italic">
          Unable to decode ICA message body, no details currently available.
        </div>
      )}
    </Card>
  );
}
