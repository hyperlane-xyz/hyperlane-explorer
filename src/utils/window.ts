export function isWindowVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}
