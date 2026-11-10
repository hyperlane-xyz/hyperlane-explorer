import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  DiagnosticActivity,
  DiagnosticObservations,
  RelayerDiagnosticState,
  mergeActivityHistory,
  reconcileDiagnosticObservations,
  reduceMessageDiagnostics,
  selectRelayObservation,
} from './types';
import {
  MessageDiagnosticsResult,
  useMessageActivityPage,
  useMessageDiagnostics,
} from './useMessageDiagnostics';

interface MessageDiagnosticsContextValue extends MessageDiagnosticsResult {
  history: ReturnType<typeof useMessageActivityPage>;
  activities: DiagnosticActivity[];
  observation?: RelayerDiagnosticState;
  selectedRelayer: string;
  setSelectedRelayer: (relayer: string) => void;
}
const MessageDiagnosticsContext = createContext<MessageDiagnosticsContextValue | null>(null);

export function MessageDiagnosticsProvider(
  props: PropsWithChildren<{ messageId: string; live: boolean; enabled: boolean }>,
) {
  return <DiagnosticsProvider key={props.messageId} {...props} />;
}

function DiagnosticsProvider({
  messageId,
  live,
  enabled,
  children,
}: PropsWithChildren<{ messageId: string; live: boolean; enabled: boolean }>) {
  const diagnostics = useMessageDiagnostics(messageId, live, enabled);
  const history = useMessageActivityPage(messageId, enabled);
  const [liveHistory, setLiveHistory] = useState<DiagnosticActivity[]>([]);
  const liveActivities = live && enabled ? diagnostics.diagnostics?.activities : undefined;
  useEffect(() => {
    // Socket snapshots replace earlier updates. Keep their original observations so
    // signature and phase timing survives subsequent updates and delivery.
    // The keyed provider resets this bounded history when the message changes.
    if (liveActivities?.length)
      setLiveHistory((previous) => mergeActivityHistory(previous, liveActivities));
  }, [liveActivities]);
  const activities = useMemo(
    () =>
      mergeActivityHistory(liveHistory, [
        ...(diagnostics.diagnostics?.activities ?? []),
        ...history.loadedActivities,
        ...(history.activityPage?.activities ?? []),
      ]),
    [
      liveHistory,
      diagnostics.diagnostics?.activities,
      history.loadedActivities,
      history.activityPage,
    ],
  );
  const [selectedRelayer, setSelectedRelayer] = useState('');
  const [automaticRelayer, setAutomaticRelayer] = useState('');
  const [retainedPageStates, setRetainedPageStates] = useState<DiagnosticObservations>();
  const pageStates = useMemo(
    () =>
      reduceMessageDiagnostics({
        version: 1,
        message_id: messageId,
        partial: true,
        activities: history.activityPage?.activities ?? [],
      }),
    [history.activityPage, messageId],
  );
  const relayers = useMemo(() => {
    const pageRelayers = new Map(
      reconcileDiagnosticObservations(retainedPageStates, pageStates).relayers.map((relay) => [
        relay.relayer,
        relay,
      ]),
    );
    const fallback = new Map<string, RelayerDiagnosticState>();
    // History is newest first. Reconstruct updates only within a contiguous page;
    // a snapshot on a sparse older page may be an obsolete anchor.
    for (const row of activities) {
      if (fallback.has(row.relayer)) continue;
      const pageRelay = pageRelayers.get(row.relayer);
      fallback.set(row.relayer, {
        relayer: row.relayer,
        activityId: row.id,
        observedAt: row.observed_at,
        state:
          pageRelay?.activityId === row.id
            ? pageRelay.state
            : (row.version === undefined || row.version === 1) && row.activity.type === 'snapshot'
              ? (row.activity.state ?? { phase: 'unknown', modules: [] })
              : { phase: 'unknown', modules: [] },
      });
    }
    // Current diagnostics own current state; history supplies missing identities
    // and observations only, never overwrites a live endpoint's state.
    for (const relay of diagnostics.relayers) fallback.set(relay.relayer, relay);
    return [...fallback.values()].sort((a, b) => a.relayer.localeCompare(b.relayer));
  }, [activities, diagnostics.relayers, pageStates, retainedPageStates]);
  const automatic = selectRelayObservation(relayers, automaticRelayer);
  const observation = selectedRelayer
    ? relayers.find((relay) => relay.relayer === selectedRelayer)
    : automatic;
  const automaticAddress = automatic?.relayer;
  useEffect(() => {
    // Preserve each page's reconstructed observations without merging across page gaps.
    setRetainedPageStates((previous) => reconcileDiagnosticObservations(previous, pageStates));
  }, [pageStates]);
  useEffect(() => {
    if (automaticAddress) setAutomaticRelayer(automaticAddress);
  }, [automaticAddress]);
  return (
    <MessageDiagnosticsContext.Provider
      value={{
        ...diagnostics,
        relayers,
        history,
        activities,
        observation,
        selectedRelayer,
        setSelectedRelayer,
      }}
    >
      {children}
    </MessageDiagnosticsContext.Provider>
  );
}

export function useMessageDiagnosticsContext() {
  const context = useContext(MessageDiagnosticsContext);
  if (!context) throw new Error('MessageDiagnosticsProvider is required');
  return context;
}
