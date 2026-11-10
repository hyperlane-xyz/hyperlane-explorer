import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { ShieldIcon } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';

import HubIcon from '../../../images/icons/hub.svg';

export function MessageTechnicalDetails({
  hidden = false,
  security,
  activity,
  warpRoute,
}: {
  hidden?: boolean;
  security: ReactNode;
  activity: ReactNode;
  warpRoute?: ReactNode;
}) {
  const [warpLoaded, setWarpLoaded] = useState(false);
  const tabs = [
    { label: 'Security', icon: <ShieldIcon width={14} height={14} color="currentColor" /> },
    { label: 'Relayer activity', icon: null },
    ...(warpRoute
      ? [{ label: 'Warp route', icon: <Image src={HubIcon} width={16} height={16} alt="" /> }]
      : []),
  ];
  return (
    <section
      hidden={hidden}
      aria-label="Message activity and diagnostics"
      className="rounded-xl border border-gray-200 bg-white"
    >
      <TabGroup
        onChange={(index) => {
          if (index === 2) setWarpLoaded(true);
        }}
      >
        <TabList
          aria-label="Technical information"
          className="flex flex-wrap gap-1 rounded-t-xl border-b border-gray-200 bg-gray-150 px-2 py-2 sm:px-4"
        >
          {tabs.map(({ label, icon }, index) => (
            <Tab
              key={label}
              className={clsx(
                'inline-flex items-center gap-2 whitespace-nowrap rounded px-2.5 py-2 text-xs font-medium text-gray-500 outline-none hover:text-gray-900 data-[selected]:bg-white data-[selected]:shadow-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-primary-500 sm:px-3',
                index === 0 ? 'data-[selected]:text-green-800' : 'data-[selected]:text-primary-800',
              )}
            >
              {icon && (
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center"
                >
                  {icon}
                </span>
              )}
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanels className="min-w-0 p-3 sm:p-4">
          <TabPanel unmount={false} className="space-y-4">
            {security}
          </TabPanel>
          <TabPanel unmount={false}>{activity}</TabPanel>
          {warpRoute && <TabPanel unmount={false}>{warpLoaded && warpRoute}</TabPanel>}
        </TabPanels>
      </TabGroup>
    </section>
  );
}
