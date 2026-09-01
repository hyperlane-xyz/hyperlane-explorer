export interface SelfRelayCandidateChecks {
  isPending: boolean;
  hasNoKnownDeliveryError: boolean;
  isPiMessage: boolean;
  isPaused: boolean;
  hasDestinationConfig: boolean;
  hasSufficientCollateral: boolean;
  isOriginEvm: boolean;
  isDestinationEvm: boolean;
}

export function shouldCheckSelfRelay(checks: SelfRelayCandidateChecks) {
  return (
    checks.isPending &&
    checks.hasNoKnownDeliveryError &&
    !checks.isPiMessage &&
    !checks.isPaused &&
    checks.hasDestinationConfig &&
    checks.hasSufficientCollateral &&
    checks.isOriginEvm &&
    checks.isDestinationEvm
  );
}
