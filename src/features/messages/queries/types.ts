import { providers } from 'ethers';

export interface LogWithTimestamp extends providers.Log {
  timestamp: number;
  from?: Address;
  to?: Address;
}
