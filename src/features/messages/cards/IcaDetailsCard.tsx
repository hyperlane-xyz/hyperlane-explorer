import Image from 'next/image';
import { useMemo } from 'react';

import { HelpIcon } from '../../../components/icons/HelpIcon';
import { Card } from '../../../components/layout/Card';
import AccountStar from '../../../images/icons/account-star.svg';
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
    <Card className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative -left-0.5 -top-px">
          <Image src={AccountStar} width={28} height={28} alt="" className="opacity-80" />
        </div>
        <div className="flex items-center pb-1">
          <h3 className="mr-2 text-md font-medium text-blue-500">ICA Details</h3>
          <HelpIcon text="Extra information for messages from/to Interchain Accounts." />
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
    </Card>
  );
}
