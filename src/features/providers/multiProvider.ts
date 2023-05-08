import { useStore } from '../../store';

export function useMultiProvider() {
  return useStore((s) => s.multiProvider);
}
