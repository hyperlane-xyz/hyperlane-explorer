import { Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { shortenAddress } from '@hyperlane-xyz/utils';

import { getRelayerLabel, getRelayerName } from '../../../consts/relayers';
import { diagnosticLabel, type RelayerDiagnosticState } from '../diagnostics/types';

export function RelayerSelector({
  observation,
  relayers,
  value,
  onChange,
}: {
  observation?: RelayerDiagnosticState;
  relayers: RelayerDiagnosticState[];
  value: string;
  onChange: (address: string) => void;
}) {
  const address = observation?.relayer || value;
  const name = address ? getRelayerLabel(address) : 'Select a relayer';
  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative min-w-0 max-w-full">
        <Label className="sr-only">Reporting relayer</Label>
        <ListboxButton
          title={address || undefined}
          className="flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs shadow-sm transition-colors hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-medium text-gray-800">{name}</span>
            {address && getRelayerName(address) && (
              <span className="shrink-0 font-mono text-xxs text-gray-500">
                {shortenAddress(address)}
              </span>
            )}
          </span>
          {!value && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xxs text-gray-500">Auto</span>
          )}
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            className="ml-1 h-4 w-4 shrink-0 text-gray-500"
          >
            <path
              d="m4 6 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </ListboxButton>
        <ListboxOptions className="absolute left-0 z-30 mt-2 max-h-72 w-full min-w-64 overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg focus:outline-none">
          <ListboxOption
            value=""
            className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-xs text-gray-700 data-[focus]:bg-gray-100 data-[selected]:bg-primary-50"
          >
            <span>
              <span className="block font-medium">Automatic</span>
              <span className="mt-0.5 block text-xxs text-gray-500">
                Follow the relayer furthest along
              </span>
            </span>
            <SelectionMark />
          </ListboxOption>
          {value && !observation && (
            <ListboxOption
              value={value}
              className="group flex items-center justify-between gap-3 rounded-md bg-primary-50 px-3 py-2 text-xs"
              title={value}
            >
              <span>
                {getRelayerLabel(value)} <span className="text-gray-500">· unavailable</span>
              </span>
              <SelectionMark />
            </ListboxOption>
          )}
          {relayers.map((relay) => (
            <ListboxOption
              key={relay.relayer}
              value={relay.relayer}
              title={relay.relayer}
              className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-xs text-gray-700 data-[focus]:bg-gray-100 data-[selected]:bg-primary-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{getRelayerLabel(relay.relayer)}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-2 text-xxs text-gray-500">
                  {getRelayerName(relay.relayer) && (
                    <span className="font-mono">{shortenAddress(relay.relayer)}</span>
                  )}
                  <span>{diagnosticLabel(relay.state.phase)}</span>
                </span>
              </span>
              <SelectionMark />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

function SelectionMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="invisible h-4 w-4 shrink-0 text-primary-600 group-data-[selected]:visible"
    >
      <path
        d="m3 8 3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
