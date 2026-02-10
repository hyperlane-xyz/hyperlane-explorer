import type { MetadataBuildResult, ValidatorInfo } from '@hyperlane-xyz/sdk';
import { shortenAddress } from '@hyperlane-xyz/utils';
import { MessageStage, useMessageStage } from '@hyperlane-xyz/widgets';
import { useState } from 'react';
import { Card } from '../../../components/layout/Card';
import { Message, MessageStatus } from '../../../types';
import { MessageDebugResult } from '../../debugger/types';
import { extractValidatorInfo } from './IsmDetailsCard';

interface Props {
  message: Message;
  blur?: boolean;
  debugResult?: MessageDebugResult;
  ismResult?: MetadataBuildResult | null;
}

export function TimelineCard({ message, blur, debugResult: _debugResult, ismResult }: Props) {
  // @ts-ignore TODO update widget chainId type
  const { stage, timings } = useMessageStage({ message });

  // Extract validator info from ISM result (new API) - this has real signature status
  const validatorInfoFromApi = extractValidatorInfo(ismResult);
  const validators = validatorInfoFromApi?.validators;
  const threshold = validatorInfoFromApi?.threshold ?? 0;

  return (
    <Card className="w-full !bg-transparent !shadow-none">
      <div className={`-mx-2 -my-2 font-light sm:mx-0 ${blur && 'blur-xs'}`}>
        <EnhancedMessageTimeline
          status={message.status}
          stage={stage}
          timings={timings}
          validators={validators}
          threshold={threshold}
        />
      </div>
    </Card>
  );
}

// Custom timeline that extends the widgets timeline with validator info
// StageTimings from widgets only includes Finalized, Validated, Relayed (not Sent)
type StageTimings = {
  [MessageStage.Finalized]: number | null;
  [MessageStage.Validated]: number | null;
  [MessageStage.Relayed]: number | null;
};

interface TimelineProps {
  status: MessageStatus;
  stage: MessageStage;
  timings: StageTimings;
  validators?: ValidatorInfo[];
  threshold: number;
}

function EnhancedMessageTimeline({
  status,
  stage: _stage,
  timings,
  validators,
  threshold,
}: TimelineProps) {
  const [showValidators, setShowValidators] = useState(false);

  const signedCount = validators?.filter((v) => v.status === 'signed').length ?? 0;
  const hasQuorum = signedCount >= threshold && threshold > 0;

  // Determine effective stage:
  // 1. If status shows delivered, stage is Relayed
  // 2. If quorum is reached from real-time validator data, stage is at least Validated
  // 3. Otherwise use the stage from useMessageStage
  let stage = _stage;
  if (status === MessageStatus.Delivered) {
    stage = MessageStage.Relayed;
  } else if (hasQuorum && _stage < MessageStage.Validated) {
    // Real-time validator data shows quorum reached, upgrade to Validated
    stage = MessageStage.Validated;
  }

  return (
    <div className="flex w-full flex-col pb-1 pt-14">
      <div className="flex w-full">
        {/* Sent Stage */}
        <div className="flex flex-1 flex-col items-center">
          <StageBar isFirst stage={MessageStage.Sent} currentStage={stage} status={status} />
          <h4 className="mt-2.5 text-xs text-gray-700 xs:text-sm sm:text-base">
            {getStageHeader(MessageStage.Sent, stage, timings, status)}
          </h4>
          <p className="mt-1 text-center text-xs text-gray-500 sm:px-4">
            Waiting for origin transaction
          </p>
        </div>

        <div className="flex-0 w-1 xs:w-2 sm:w-3" />

        {/* Finalized Stage */}
        <div className="flex flex-1 flex-col items-center">
          <StageBar stage={MessageStage.Finalized} currentStage={stage} status={status} />
          <h4 className="mt-2.5 text-xs text-gray-700 xs:text-sm sm:text-base">
            {getStageHeader(MessageStage.Finalized, stage, timings, status)}
          </h4>
          <p className="mt-1 text-center text-xs text-gray-500 sm:px-4">
            Origin transaction has sufficient confirmations
          </p>
        </div>

        <div className="flex-0 w-1 xs:w-2 sm:w-3" />

        {/* Validated Stage - WITH VALIDATOR INFO */}
        <div className="flex flex-1 flex-col items-center">
          <StageBar stage={MessageStage.Validated} currentStage={stage} status={status} />
          <h4 className="mt-2.5 text-xs text-gray-700 xs:text-sm sm:text-base">
            {getStageHeader(MessageStage.Validated, stage, timings, status)}
          </h4>

          {/* Validator progress summary */}
          {validators && validators.length > 0 ? (
            <div className="mt-1 flex flex-col items-center">
              <button
                onClick={() => setShowValidators(!showValidators)}
                className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                  hasQuorum
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                }`}
              >
                {signedCount}/{validators.length} ({threshold} req) {showValidators ? '▲' : '▼'}
              </button>
            </div>
          ) : (
            <p className="mt-1 text-center text-xs text-gray-500 sm:px-4">
              Validators have signed the message bundle
            </p>
          )}
        </div>

        <div className="flex-0 w-1 xs:w-2 sm:w-3" />

        {/* Relayed Stage */}
        <div className="flex flex-1 flex-col items-center">
          <StageBar isLast stage={MessageStage.Relayed} currentStage={stage} status={status} />
          <h4 className="mt-2.5 text-xs text-gray-700 xs:text-sm sm:text-base">
            {getStageHeader(MessageStage.Relayed, stage, timings, status)}
          </h4>
          <p className="mt-1 text-center text-xs text-gray-500 sm:px-4">
            Destination transaction has been confirmed
          </p>
        </div>
      </div>

      {/* Expandable validator list */}
      {showValidators && validators && validators.length > 0 && (
        <ValidatorDropdown
          validators={validators}
          threshold={threshold}
          signedCount={signedCount}
        />
      )}
    </div>
  );
}

function StageBar({
  stage,
  currentStage,
  status,
  isFirst,
  isLast,
}: {
  stage: MessageStage;
  currentStage: MessageStage;
  status: MessageStatus;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const opacityClass = getStageOpacityClass(stage, currentStage, status);

  return (
    <div
      className={`relative flex h-6 w-full items-center justify-center bg-primary-800 ${opacityClass} ${
        isFirst ? 'rounded-l' : ''
      } ${isLast ? 'rounded-r' : ''}`}
    >
      <div className="h-3 w-3 rounded-full bg-white" />
      {/* Icon above */}
      <div className="absolute -top-12 flex flex-col items-center">
        <StageIcon stage={stage} />
        <div className="h-4 w-0.5 bg-primary-800" />
      </div>
      {/* Chevrons */}
      {!isFirst && <ChevronWhite />}
      {!isLast && <ChevronBlue />}
    </div>
  );
}

function StageIcon({ stage }: { stage: MessageStage }) {
  const iconMap: Partial<Record<MessageStage, string>> = {
    [MessageStage.Sent]: '✈',
    [MessageStage.Finalized]: '🔒',
    [MessageStage.Validated]: '🛡',
    [MessageStage.Relayed]: '✉',
  };

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-800 text-white">
      {iconMap[stage] || '•'}
    </div>
  );
}

function ChevronWhite() {
  return (
    <div className="absolute -left-3 top-0 h-6 w-3 overflow-hidden">
      <div className="h-0 w-0 border-y-[12px] border-l-[12px] border-y-transparent border-l-white" />
    </div>
  );
}

function ChevronBlue() {
  return (
    <div className="absolute -right-3 top-0 h-6 w-3 overflow-hidden">
      <div className="h-0 w-0 border-y-[12px] border-l-[12px] border-y-transparent border-l-primary-800" />
    </div>
  );
}

function ValidatorDropdown({
  validators,
  threshold,
  signedCount,
}: {
  validators: ValidatorInfo[];
  threshold: number;
  signedCount: number;
}) {
  const hasQuorum = signedCount >= threshold && threshold > 0;

  return (
    <div className="mx-auto mt-4 w-full max-w-md rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Validator Signatures</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            hasQuorum ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {signedCount}/{validators.length} ({threshold} required) {hasQuorum ? '✓' : ''}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative mb-3 h-2 w-full rounded-full bg-gray-200">
        {validators.length > 0 && (
          <>
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-primary-800 transition-all duration-300"
              style={{ width: `${(signedCount / validators.length) * 100}%` }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-gray-600"
              style={{ left: `${(threshold / validators.length) * 100}%` }}
              title={`Threshold: ${threshold}`}
            />
          </>
        )}
      </div>

      {/* Validator list */}
      <div className="space-y-1.5">
        {validators.map((validator, index) => (
          <div
            key={validator.address || index}
            className="flex items-center justify-between rounded bg-gray-50 px-2 py-1.5 text-xs"
          >
            <div className="flex items-center space-x-2">
              <span
                className={`font-medium ${
                  validator.status === 'signed'
                    ? 'text-green-600'
                    : validator.status === 'error'
                      ? 'text-red-500'
                      : 'text-gray-400'
                }`}
              >
                {validator.status === 'signed' ? '✓' : validator.status === 'error' ? '✗' : '○'}
              </span>
              <span className="font-mono text-gray-700">{shortenAddress(validator.address)}</span>
              {validator.alias && <span className="text-gray-500">({validator.alias})</span>}
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                validator.status === 'signed'
                  ? 'bg-green-100 text-green-700'
                  : validator.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {validator.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getStageHeader(
  targetStage: MessageStage,
  currentStage: MessageStage,
  timings: StageTimings,
  status: MessageStatus,
) {
  let label = '';
  if (targetStage === MessageStage.Finalized) {
    label = currentStage >= targetStage ? 'Finalized' : 'Finalizing';
  } else if (targetStage === MessageStage.Validated) {
    label = currentStage >= targetStage ? 'Validated' : 'Validating';
  } else if (targetStage === MessageStage.Relayed) {
    label = currentStage >= targetStage ? 'Relayed' : 'Relaying';
  } else if (targetStage === MessageStage.Sent) {
    label = currentStage >= targetStage ? 'Sent' : 'Sending';
  }
  // Sent stage doesn't have timing in StageTimings
  const timing = targetStage === MessageStage.Sent ? null : timings[targetStage];
  if (status === MessageStatus.Failing) {
    if (targetStage === currentStage + 1) return `${label}: failed`;
    if (targetStage > currentStage + 1) return label;
  }
  if (timing) return `${label}: ${timing} sec`;
  else return label;
}

function getStageOpacityClass(
  targetStage: MessageStage,
  currentStage: MessageStage,
  messageStatus: MessageStatus,
) {
  if (currentStage >= targetStage) return '';
  if (currentStage === targetStage - 1 && messageStatus !== MessageStatus.Failing)
    return 'animate-pulse';
  return 'opacity-50';
}
