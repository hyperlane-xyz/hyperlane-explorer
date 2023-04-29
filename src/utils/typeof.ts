export function isNullish<T>(val: T) {
  if (val === null || val === undefined) return true;
  else return false;
}
