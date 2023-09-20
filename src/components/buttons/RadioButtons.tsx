import { RadioGroup } from '@headlessui/react';

interface Props {
  options: Array<{ value: string | number; display: string }>;
  selected: string | number;
  onChange: (value: string | number) => void;
  label?: string;
}

export function RadioButtons({ options, selected, onChange, label }: Props) {
  return (
    <div className="rounded border border-gray-200 overflow-hidden">
      <RadioGroup value={selected} onChange={onChange}>
        {label && <RadioGroup.Label className="sr-only">{label}</RadioGroup.Label>}
        <div className="flex items-center divide-x">
          {options.map((o) => (
            <RadioGroup.Option
              key={o.value}
              value={o.value}
              className={({ checked }) =>
                `${checked ? 'bg-blue-500 hover:bg-blue-400' : 'bg-white hover:bg-gray-100'}
                    relative flex cursor-pointer px-2 py-1.5 outline-none`
              }
            >
              {({ checked }) => (
                <div className="flex w-full items-center justify-between">
                  <RadioGroup.Label
                    as="p"
                    className={`text-xs font-medium ${checked ? 'text-white' : 'text-gray-700'}`}
                  >
                    {o.display}
                  </RadioGroup.Label>
                </div>
              )}
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
