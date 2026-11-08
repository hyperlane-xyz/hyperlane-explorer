import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useState, type ReactNode } from 'react';

export function MessageTechnicalDetails({
  hidden = false,
  security,
  activity,
  details,
}: {
  hidden?: boolean;
  security: ReactNode;
  activity: ReactNode;
  details: ReactNode;
}) {
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  return (
    <section
      hidden={hidden}
      aria-label="Message activity and diagnostics"
      className="rounded-xl border border-gray-200 bg-white"
    >
      <TabGroup
        onChange={(index) => {
          if (index === 2) setDetailsLoaded(true);
        }}
      >
        <TabList
          aria-label="Technical information"
          className="flex gap-1 rounded-t-xl border-b border-gray-200 bg-gray-150 px-3 py-2 sm:px-4"
        >
          {['Activity', 'Security', 'Details'].map((label) => (
            <Tab
              key={label}
              className="rounded px-3 py-2 text-xs font-medium text-gray-500 outline-none hover:text-gray-900 data-[selected]:bg-white data-[selected]:text-primary-800 data-[selected]:shadow-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-primary-500"
            >
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanels className="min-w-0 p-3 sm:p-4">
          <TabPanel unmount={false}>{activity}</TabPanel>
          <TabPanel unmount={false}>{security}</TabPanel>
          <TabPanel unmount={false} className="space-y-4">
            {detailsLoaded && details}
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </section>
  );
}
