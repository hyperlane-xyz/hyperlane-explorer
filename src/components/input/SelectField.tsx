import { ChangeEvent } from 'react';

type Props = React.DetailedHTMLProps<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  HTMLSelectElement
> & {
  options: Array<{ value: string; display: string }>;
  value: string;
  onValueSelect: (value: string) => void;
  classes?: string;
};

export function SelectField(props: Props) {
  const { options, value, onValueSelect, classes, ...passThruProps } = props;

  const onChangeSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    onValueSelect(event?.target?.value || '');
  };

  return (
    <select
      className={`px-1.5 py-1 text-sm border border-gray-500 rounded bg-transparent invalid:text-gray-400 ${
        classes || ''
      }`}
      {...passThruProps}
      value={value}
      onChange={onChangeSelect}
    >
      {options.map((o, i) => (
        <option key={`option-${i}`} value={o.value}>
          {o.display}
        </option>
      ))}
    </select>
  );
}
