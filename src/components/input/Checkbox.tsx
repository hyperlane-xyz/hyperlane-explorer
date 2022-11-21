import React from 'react';

import styles from './Checkbox.module.css';

interface Props {
  checked: boolean;
  onToggle: (c: boolean) => void;
  name?: string;
}

export function CheckBox({ checked, onToggle, name, children }: React.PropsWithChildren<Props>) {
  const onChange = () => {
    onToggle(!checked);
  };

  return (
    <label className="flex items-center cursor-pointer hover:opacity-80">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className={styles.checkbox}
      />
      {children}
    </label>
  );
}
