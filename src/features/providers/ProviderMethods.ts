export interface IProviderMethods {
  readonly supportedMethods: ProviderMethod[];
}

export enum ProviderMethod {
  Call = 'call',
  EstimateGas = 'estimateGas',
  GetBalance = 'getBalance',
  GetBlock = 'getBlock',
  GetBlockNumber = 'getBlockNumber',
  GetCode = 'getCode',
  GetGasPrice = 'getGasPrice',
  GetStorageAt = 'getStorageAt',
  GetTransaction = 'getTransaction',
  GetTransactionCount = 'getTransactionCount',
  GetTransactionReceipt = 'getTransactionReceipt',
  GetLogs = 'getLogs',
  SendTransaction = 'sendTransaction',
}

export const AllProviderMethods = Object.values(ProviderMethod);

export function excludeMethods(exclude: ProviderMethod[]): ProviderMethod[] {
  return AllProviderMethods.filter((m) => !exclude.includes(m));
}
