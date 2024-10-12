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
      className={`rounded border border-gray-400 bg-transparent px-2 py-1 text-sm font-light invalid:text-gray-400 ${
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
