import { memo } from 'react';

import styles from './Spinner.module.css';

// From https://loading.io/css/
function _Spinner() {
  return (
    <div className={styles.spinner}>
      <div></div>
      <div></div>
      <div></div>
      <div></div>
    </div>
  );
}

export const Spinner = memo(_Spinner);
