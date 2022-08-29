export function invertKeysAndValues(data: any) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [value, key]),
  );
}
