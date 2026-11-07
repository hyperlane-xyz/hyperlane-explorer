import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { DiagnosticActivity, RelayerDiagnosticState, selectRelayObservation } from './types';
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
  const refreshKey = diagnostics.diagnostics?.activities.reduce(
    (latest, row) => (BigInt(row.id) > BigInt(latest) ? row.id : latest),
    '0',
  );
  const history = useMessageActivityPage(messageId, refreshKey, enabled);
  const activities = useMemo(
    () => [
      ...new Map(
        [
          ...(diagnostics.diagnostics?.activities ?? []),
          ...history.loadedActivities,
          ...(history.activityPage?.activities ?? []),
        ].map((row) => [row.id, row]),
      ).values(),
    ],
    [diagnostics.diagnostics?.activities, history.loadedActivities, history.activityPage],
  );
  const [selectedRelayer, setSelectedRelayer] = useState('');
  const [automaticRelayer, setAutomaticRelayer] = useState('');
  const automatic = selectRelayObservation(diagnostics.relayers, automaticRelayer);
  const observation = selectedRelayer
    ? diagnostics.relayers.find((relay) => relay.relayer === selectedRelayer)
    : automatic;
  const automaticAddress = automatic?.relayer;
  useEffect(() => {
    if (automaticAddress) setAutomaticRelayer(automaticAddress);
  }, [automaticAddress]);
  return (
    <MessageDiagnosticsContext.Provider
      value={{
        ...diagnostics,
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
