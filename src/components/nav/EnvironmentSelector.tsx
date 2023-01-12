import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { Environment, environments } from '../../consts/environments';
import { useEnvironment } from '../../store';
import { getQueryParamString, replacePathParam } from '../../utils/queryParams';
import { toTitleCase } from '../../utils/string';
import { SelectField } from '../input/SelectField';

export function EnvironmentSelector() {
  const router = useRouter();
  const { environment, setEnvironment } = useEnvironment();

  const queryEnv = getQueryParamString(router.query, 'env');
  useEffect(() => {
    if (!queryEnv || queryEnv === environment) return;
    if (environments.includes(queryEnv as Environment)) {
      setEnvironment(queryEnv as Environment);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelect = (env: string) => {
    setEnvironment(env as Environment);
    replacePathParam('env', env);
  };

  return (
    <div className="relative">
      {/* <Image src={HubIcon} width={20} height={20} className="opacity-70" /> */}
      <SelectField
        classes="w-28 text-gray-600 border-gray-600 bg-gray-50 text-[0.95rem]"
        options={envOptions}
        value={environment}
        onValueSelect={onSelect}
      />
    </div>
  );
}

const envOptions = [
  { value: Environment.Mainnet, display: toTitleCase(Environment.Mainnet) },
  { value: Environment.Testnet, display: toTitleCase(Environment.Testnet) },
];
