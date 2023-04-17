import type { NextPage } from 'next';

import { ConfigureChains } from '../features/chains/ConfigureChains';

const SettingsPage: NextPage = () => {
  return (
    <div className="mt-4 mb-2 px-2 sm:px-6 lg:pr-14 w-full">
      <ConfigureChains />
    </div>
  );
};

export default SettingsPage;
