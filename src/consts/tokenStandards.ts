// Cosmos warp standards don't normalize amounts to maxDecimals.
// These tokens use their native decimals in the message body.
export const COSMOS_STANDARDS = new Set([
  // CosmWasm token standards
  'CW20',
  'CWNative',
  'CW721',
  'CwHypNative',
  'CwHypCollateral',
  'CwHypSynthetic',
  // Cosmos native/IBC standards
  'CosmosNative',
  'CosmosIbc',
  'CosmosIcs20',
  'CosmosIcs721',
  'CosmosNativeHypCollateral',
  'CosmosNativeHypSynthetic',
]);
