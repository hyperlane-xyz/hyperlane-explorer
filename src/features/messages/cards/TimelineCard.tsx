import { useQuery } from '@tanstack/react-query';
import { BigNumber } from 'ethers';
import Image from 'next/future/image';
import { useEffect } from 'react';
import { toast } from 'react-toastify';

import { ChainName, chainMetadata } from '@hyperlane-xyz/sdk';

import { WideChevronIcon } from '../../../components/icons/WideChevron';
import { Card } from '../../../components/layout/Card';
import { chainIdToBlockTime, chainIdToName } from '../../../consts/chains';
import EnvelopeIcon from '../../../images/icons/envelope-check.svg';
import LockIcon from '../../../images/icons/lock.svg';
import AirplaneIcon from '../../../images/icons/paper-airplane.svg';
import ShieldIcon from '../../../images/icons/shield-check.svg';
import { Message, MessageStatus } from '../../../types';
import { getChainEnvironment } from '../../../utils/chains';
import { queryExplorerForBlock } from '../../../utils/explorers';
import { logger } from '../../../utils/logger';
import { fetchWithTimeout } from '../../../utils/timeout';

const VALIDATION_TIME_EST = 5;

enum Phase {
  Sent = 0,
  Finalized = 1,
  Validated = 2,
  Relayed = 3,
}

interface Props {
  message: Message;
  resolvedStatus: MessageStatus;
  shouldBlur: boolean;
}

export function TimelineCard({ message, resolvedStatus: status }: Props) {
  const {
    originChainId,
    destinationChainId,
    originTimestamp,
    destinationTimestamp,
    leafIndex,
    originTransaction,
  } = message;

  const { phase, timings } = useMessagePhase(
    status,
    originChainId,
    destinationChainId,
    leafIndex,
    originTransaction.blockNumber,
    originTimestamp,
    destinationTimestamp,
  );

  const timeSent = new Date(originTimestamp);

  return (
    <Card width="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className="px-2 pt-14 pb-1 flex">
        <div className="flex-1 flex flex-col items-center">
          <div className="w-full h-6 flex items-center justify-center bg-blue-500 rounded-l relative">
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={AirplaneIcon} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
            <div className="absolute -right-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" />
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">Message sent</h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Origin transaction sent at ${timeSent.toLocaleDateString()} ${timeSent.toLocaleTimeString()}`}</p>
        </div>
        <div className="flex-0 w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-6 flex items-center justify-center bg-blue-500 relative ${getPhaseClass(
              Phase.Finalized,
              phase,
              status,
            )}`}
          >
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={LockIcon} size={12} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
            <div className="absolute -left-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" color="#ffffff" />
            </div>
            <div className="absolute -right-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" />
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">
            {getPhaseHeader(Phase.Finalized, phase, timings)}
          </h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Origin transaction has sufficient confirmations`}</p>
        </div>
        <div className="flex-0 w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-6 flex items-center justify-center bg-blue-500 relative ${getPhaseClass(
              Phase.Validated,
              phase,
              status,
            )}`}
          >
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={ShieldIcon} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
            <div className="absolute -left-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" color="#ffffff" />
            </div>
            <div className="absolute -right-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" />
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">
            {getPhaseHeader(Phase.Validated, phase, timings)}
          </h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Validators have signed the message bundle`}</p>
        </div>
        <div className="flex-0 w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-6 flex items-center justify-center bg-blue-500 rounded-r relative ${getPhaseClass(
              Phase.Relayed,
              phase,
              status,
            )}`}
          >
            <div className="w-3 h-3 rounded-full bg-white"></div>
            <div className="absolute -top-12 flex flex-col items-center">
              <StageIcon src={EnvelopeIcon} />
              <div className="w-0.5 h-4 bg-blue-500"></div>
            </div>
            <div className="absolute -left-3 top-0 h-6">
              <WideChevronIcon direction="e" height="100%" width="auto" color="#ffffff" />
            </div>
          </div>
          <h4 className="mt-2.5 text-gray-700">{getPhaseHeader(Phase.Relayed, phase, timings)}</h4>
          <p className="mt-1 px-2 text-xs text-gray-500 text-center">{`Destination transaction has been confirmed`}</p>
        </div>
      </div>
    </Card>
  );
}

function StageIcon({ src, size }: { src: any; size?: number }) {
  return (
    <div className="h-9 w-9 flex items-center justify-center rounded-full bg-blue-500">
      <Image src={src} width={size ?? 14} height={size ?? 14} alt="" />
    </div>
  );
}

function getPhaseHeader(
  targetPhase: Phase,
  currentPhase: Phase,
  timings: Partial<Record<Phase, string>>,
) {
  let label = '';
  if (targetPhase === Phase.Finalized) {
    label = currentPhase >= targetPhase ? 'Finalized' : 'Finalizing';
  } else if (targetPhase === Phase.Validated) {
    label = currentPhase >= targetPhase ? 'Validated' : 'Validating';
  } else if (targetPhase === Phase.Relayed) {
    label = currentPhase >= targetPhase ? 'Relayed' : 'Relaying';
  }
  const timing = timings[targetPhase];
  if (timing) return `${label}: ${timing}`;
  else return label;
}

function getPhaseClass(targetPhase: Phase, currentPhase: Phase, messageStatus: MessageStatus) {
  if (currentPhase >= targetPhase) return '';
  if (currentPhase === targetPhase - 1 && messageStatus !== MessageStatus.Failing)
    return 'animate-pulse-slow';
  return 'opacity-50';
}

function useMessagePhase(
  status: MessageStatus,
  originChainId: number,
  destChainId: number,
  leafIndex: number,
  originBlockNumber: number,
  originTimestamp: number,
  destinationTimestamp?: number,
) {
  const { data, isFetching, error } = useQuery(
    [
      'messagePhase',
      status,
      originChainId,
      destChainId,
      originTimestamp,
      destinationTimestamp,
      leafIndex,
      originBlockNumber,
    ],
    async () => {
      if (!originChainId || !destChainId || !leafIndex || !originTimestamp || !originBlockNumber) {
        return null;
      }

      const relayEstimate = Math.floor(chainIdToBlockTime[destChainId] * 1.5);
      const finalityBlocks = getFinalityBlocks(originChainId);
      const finalityEstimate = finalityBlocks * (chainIdToBlockTime[originChainId] || 3);

      if (status === MessageStatus.Delivered && destinationTimestamp) {
        // For delivered messages, just to rough estimates for phases
        // This saves us from making extra explorer calls. May want to revisit in future

        const totalDuration = Math.round((destinationTimestamp - originTimestamp) / 1000);
        const finalityDuration = Math.min(finalityEstimate, totalDuration - VALIDATION_TIME_EST);
        const remaining = totalDuration - finalityDuration;
        const validateDuration = Math.min(Math.round(remaining * 0.25), VALIDATION_TIME_EST);
        const relayDuration = remaining - validateDuration;
        return {
          phase: Phase.Relayed,
          timings: {
            [Phase.Finalized]: `${finalityDuration} sec`,
            [Phase.Validated]: `${validateDuration} sec`,
            [Phase.Relayed]: `${relayDuration} sec`,
          },
        };
      }

      const latestLeafIndex = await tryFetchLatestLeafIndex(originChainId);
      if (latestLeafIndex && latestLeafIndex >= leafIndex) {
        return {
          phase: Phase.Validated,
          timings: {
            [Phase.Finalized]: `${finalityEstimate} sec`,
            [Phase.Validated]: `~${VALIDATION_TIME_EST} sec`,
            [Phase.Relayed]: `~${relayEstimate} sec`,
          },
        };
      }

      const latestBlock = await tryFetchChainLatestBlock(originChainId);
      const finalizedBlock = originBlockNumber + finalityBlocks;
      if (latestBlock && BigNumber.from(latestBlock.number).gte(finalizedBlock)) {
        return {
          phase: Phase.Finalized,
          timings: {
            [Phase.Finalized]: `${finalityEstimate} sec`,
            [Phase.Validated]: `~${VALIDATION_TIME_EST} sec`,
            [Phase.Relayed]: `~${relayEstimate} sec`,
          },
        };
      }

      return {
        phase: Phase.Sent,
        timings: {
          [Phase.Finalized]: `~${finalityEstimate} sec`,
          [Phase.Validated]: `~${VALIDATION_TIME_EST} sec`,
          [Phase.Relayed]: `~${relayEstimate} sec`,
        },
      };
    },
  );

  // Show toast on error
  useEffect(() => {
    if (error) {
      logger.error('Error fetching message phase', error);
      toast.warn(`Error building timeline: ${error}`);
    }
  }, [error]);

  return {
    phase: data?.phase || Phase.Sent,
    timings: data?.timings || {},
    isFetching,
  };
}

function getFinalityBlocks(chainId: number) {
  const chainName = chainIdToName[chainId] as ChainName;
  const metadata = chainMetadata[chainName];
  const finalityBlocks = metadata?.finalityBlocks || 0;
  return Math.max(finalityBlocks, 1);
}

async function tryFetchChainLatestBlock(chainId: number) {
  logger.debug(`Attempting to fetch latest block for:`, chainId);
  try {
    // TODO do on backend and use API key
    const block = await queryExplorerForBlock(chainId, 'latest', false);
    return block;
  } catch (error) {
    logger.error('Error fetching latest block', error);
    return null;
  }
}

async function tryFetchLatestLeafIndex(chainId: number) {
  logger.debug(`Attempting to fetch leaf index for:`, chainId);
  try {
    const url = getS3BucketUrl(chainId);
    logger.debug(`Querying bucket:`, url);
    const response = await fetchWithTimeout(url, undefined, 3000);
    const text = await response.text();
    const leafIndex = BigNumber.from(text).toNumber();
    logger.debug(`Found leaf index:`, leafIndex);
    return leafIndex;
  } catch (error) {
    logger.error('Error fetching leaf index', error);
    return null;
  }
}

// Partly copied from https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/1fc65f3b7f31f86722204a9de08506f212720a52/typescript/infra/config/environments/mainnet/validators.ts#L12
function getS3BucketUrl(chainId: number) {
  const chainName = chainIdToName[chainId] as ChainName;
  const environment = getChainEnvironment(chainId);
  const bucketName = `abacus-${environment}-${chainName}-validator-0`;
  return `https://${bucketName}.s3.us-east-1.amazonaws.com/checkpoint_latest_index.json`;
}
