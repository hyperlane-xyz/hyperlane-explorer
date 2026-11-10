import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';

import { ActivityIcon } from '../../../components/icons/ActivityIcon';
import HubIcon from '../../../images/icons/hub.svg';

export function MessageTechnicalDetails({
  activity,
  warpRoute,
}: {
  activity: ReactNode;
  warpRoute?: ReactNode;
}) {
  const [warpLoaded, setWarpLoaded] = useState(false);
  const tabs = [
    { label: 'Relayer activity', icon: <ActivityIcon /> },
    ...(warpRoute
      ? [{ label: 'Warp route', icon: <Image src={HubIcon} width={16} height={16} alt="" /> }]
      : []),
  ];
  return (
    <section
      aria-label="Message activity and route"
      className="shadow-card min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <TabGroup
        onChange={(index) => {
          if (index === 1) setWarpLoaded(true);
        }}
      >
        <TabList
          aria-label="Activity and route"
          className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-150 px-2 py-2 sm:px-4"
        >
          {tabs.map(({ label, icon }) => (
            <Tab
              key={label}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded px-2.5 py-2 text-xs font-medium text-gray-500 outline-none hover:text-gray-900 data-[selected]:bg-white data-[selected]:text-primary-800 data-[selected]:shadow-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-primary-500 sm:px-3"
            >
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center"
              >
                {icon}
              </span>
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanels className="min-w-0 p-3 sm:p-4">
          <TabPanel unmount={false}>{activity}</TabPanel>
          {warpRoute && <TabPanel unmount={false}>{warpLoaded && warpRoute}</TabPanel>}
        </TabPanels>
      </TabGroup>
    </section>
  );
}
