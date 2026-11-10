import type { TimelineEntry } from '../diagnostics/activityTimeline';

const paths = {
  dispatch: 'm3 3 19 9-19 9 4-9-4-9Zm4 9h15',
  pickup: 'M5 4H3v16h18V4h-2M3 15h5l2 3h4l2-3h5M12 3v10m-4-4 4 4 4-4',
  signature: 'm5 12 4 4L19 6',
  preparing:
    'M13 21H4V3h10l5 5v4M14 3v5h5M7 7h3M7 11h3M20 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 3 3 3',
  waiting: 'M6 3h12M6 21h12M7 3v4l10 10v4M17 3v4L7 17v4M7 7h10M7 17h10',
  security: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  validated: 'm12 2 3 2 4 1 1 4 2 3-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-3 1-4 4-1 3-2Zm-5 10 3 3 7-7',
  submitting: 'M4 15v6h16v-6M12 16V3m-5 5 5-5 5 5',
  submitted:
    'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm0 1v7M8 7a7 7 0 0 0 0 10M16 7a7 7 0 0 1 0 10M5 4a11 11 0 0 0 0 16M19 4a11 11 0 0 1 0 16',
  pendingInclusion: 'M3 5h18M3 12h10M3 19h10M17 8l4 4-4 4M21 12h-8',
  mempool: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  included: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10M7.5 4.5l9 5',
  delivered: 'M3 4h18v16H3V4Zm0 11h5l2 3h4l2-3h5M8 9l3 3 5-6',
  rechecked: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-2 6 6 6M6 10l3 3 5-6',
  confirmed: 'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4V10Zm4 6 3 3 5-6',
  retry: 'M20 7H7l-4 4M4 17h13l4-4M20 3v4h-4M4 21v-4h4',
  failed: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
};

function iconFor(entry: TimelineEntry): keyof typeof paths {
  switch (entry.kind) {
    case 'dispatch':
      return 'dispatch';
    case 'pickup':
      return 'pickup';
    case 'signature':
      return 'signature';
    case 'security':
      return 'security';
    case 'delivery':
      return 'delivered';
    case 'validation':
      return entry.status === 'failed' ? 'failed' : 'validated';
  }

  const activity = entry.rows.at(-1)?.activity;
  const state = activity?.state;
  const phase = entry.phase ?? state?.phase;
  if (phase === 'retrying' || activity?.type === 'retry') return 'retry';
  if (entry.status === 'failed' || phase === 'dropped') return 'failed';
  if (entry.kind === 'submission') {
    switch (entry.submissionStage ?? state?.submission?.stage) {
      case 'submitted':
        return 'submitted';
      case 'pending_inclusion':
        return 'pendingInclusion';
      case 'mempool':
        return 'mempool';
      case 'included':
        return 'included';
      case 'finalized':
        return 'confirmed';
      default:
        return 'submitting';
    }
  }
  switch (phase) {
    case 'delivered':
      return 'rechecked';
    case 'awaiting_signatures':
      return 'waiting';
    case 'preparing':
      return 'preparing';
    default:
      return activity?.type.startsWith('metadata') || activity?.type === 'ism_verification'
        ? 'security'
        : 'activity';
  }
}

export function MessageTimelineIcon({ entry }: { entry: TimelineEntry }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[iconFor(entry)]} />
    </svg>
  );
}
