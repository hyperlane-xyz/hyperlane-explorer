export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

// TODO add unit tests
// Only allows letters and numbers
const alphanumericRgex = /[^a-zA-Z0-9]/gi;
export function sanitizeString(str: string) {
  if (!str || typeof str !== 'string') return '';
  return str.replaceAll(alphanumericRgex, '');
}
