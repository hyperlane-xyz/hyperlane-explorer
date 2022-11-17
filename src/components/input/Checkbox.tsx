import React from 'react';

import styles from './Checkbox.module.css';

interface Props {
  checked: boolean;
  onCheck: (c: boolean) => void;
  name?: string;
}

export function CheckBox({ checked, onCheck, name, children }: React.PropsWithChildren<Props>) {
  const onChange = () => {
    onCheck(!checked);
  };

  return (
    <label className="flex items-center cursor-pointer">
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
