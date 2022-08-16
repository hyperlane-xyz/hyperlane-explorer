export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

export function toShortened(value: string, length: number) {
  if (!value || value.length <= length) return value;
  return value.substring(0, length) + '...';
}
