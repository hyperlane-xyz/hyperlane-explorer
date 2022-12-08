import { useQuery } from '@tanstack/react-query';
import { BigNumber } from 'ethers';
import Image from 'next/image';
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
import { Message, MessageStatus, PartialTransactionReceipt } from '../../../types';
import { queryExplorerForBlock } from '../../../utils/explorers';
import { logger } from '../../../utils/logger';
import { fetchWithTimeout } from '../../../utils/timeout';

const VALIDATION_TIME_EST = 5;

enum Stage {
  Sent = 0,
  Finalized = 1,
  Validated = 2,
  Relayed = 3,
}

interface Props {
  message: Message;
  resolvedStatus: MessageStatus;
  resolvedDestinationTx?: PartialTransactionReceipt;
  shouldBlur?: boolean;
}

export function TimelineCard({ message, resolvedStatus: status, resolvedDestinationTx }: Props) {
  const {
    nonce,
    originChainId,
    destinationChainId,
    originTimestamp,
    destinationTimestamp,
    originTransaction,
  } = message;

  const { stage, timings } = useMessageStage(
    status,
    nonce,
    originChainId,
    destinationChainId,
    originTransaction.blockNumber,
    originTimestamp,
    destinationTimestamp || resolvedDestinationTx?.timestamp,
  );

  const timeSent = new Date(originTimestamp);

  return (
    <Card classes="w-full">
      {/* <div className="flex items-center justify-end">
        <h3 className="text-gray-500 font-medium text-md mr-2">Delivery Timeline</h3>
        <HelpIcon size={16} text="A breakdown of the stages for delivering a message" />
      </div> */}
      <div className="sm:px-2 pt-14 pb-1 flex">
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
          <h4 className="mt-2.5 text-gray-700 text-sm sm:text-base">Message sent</h4>
          <p className="mt-1 sm:px-4 text-xs text-gray-500 text-center">{`Origin transaction sent at ${timeSent.toLocaleDateString()} ${timeSent.toLocaleTimeString()}`}</p>
        </div>
        <div className="flex-0 w-2 sm:w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-6 flex items-center justify-center bg-blue-500 relative ${getStageClass(
              Stage.Finalized,
              stage,
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
          <h4 className="mt-2.5 text-gray-700 text-sm sm:text-base">
            {getStageHeader(Stage.Finalized, stage, timings, status)}
          </h4>
          <p className="mt-1 sm:px-4 text-xs text-gray-500 text-center">
            Origin transaction has sufficient confirmations
          </p>
        </div>
        <div className="flex-0 w-2 sm:w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-6 flex items-center justify-center bg-blue-500 relative ${getStageClass(
              Stage.Validated,
              stage,
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
          <h4 className="mt-2.5 text-gray-700 text-sm sm:text-base">
            {getStageHeader(Stage.Validated, stage, timings, status)}
          </h4>
          <p className="mt-1 sm:px-4 text-xs text-gray-500 text-center">
            Validators have signed the message bundle
          </p>
        </div>
        <div className="flex-0 w-2 sm:w-5"></div>
        <div className="flex-1 flex flex-col items-center">
          <div
            className={`w-full h-6 flex items-center justify-center bg-blue-500 rounded-r relative ${getStageClass(
              Stage.Relayed,
              stage,
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
          <h4 className="mt-2.5 text-gray-700 text-sm sm:text-base">
            {getStageHeader(Stage.Relayed, stage, timings, status)}
          </h4>
          <p className="mt-1 sm:px-4 text-xs text-gray-500 text-center">
            Destination transaction has been confirmed
          </p>
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

function getStageHeader(
  targetStage: Stage,
  currentStage: Stage,
  timings: Partial<Record<Stage, string>>,
  status: MessageStatus,
) {
  let label = '';
  if (targetStage === Stage.Finalized) {
    label = currentStage >= targetStage ? 'Finalized' : 'Finalizing';
  } else if (targetStage === Stage.Validated) {
    label = currentStage >= targetStage ? 'Validated' : 'Validating';
  } else if (targetStage === Stage.Relayed) {
    label = currentStage >= targetStage ? 'Relayed' : 'Relaying';
  }
  const timing = timings[targetStage];
  if (status === MessageStatus.Failing) {
    if (targetStage === currentStage + 1) return `${label}: failed`;
    if (targetStage > currentStage + 1) return label;
  }
  if (timing) return `${label}: ${timing}`;
  else return label;
}

function getStageClass(targetStage: Stage, currentStage: Stage, messageStatus: MessageStatus) {
  if (currentStage >= targetStage) return '';
  if (currentStage === targetStage - 1 && messageStatus !== MessageStatus.Failing)
    return 'animate-pulse-slow';
  return 'opacity-50';
}

function useMessageStage(
  status: MessageStatus,
  nonce: number,
  originChainId: number,
  destChainId: number,
  originBlockNumber: number,
  originTimestamp: number,
  destinationTimestamp?: number,
) {
  const { data, isFetching, error } = useQuery(
    [
      'messageStage',
      status,
      nonce,
      originChainId,
      destChainId,
      originTimestamp,
      destinationTimestamp,
      originBlockNumber,
    ],
    async () => {
      if (!originChainId || !destChainId || !nonce || !originTimestamp || !originBlockNumber) {
        return null;
      }

      const relayEstimate = Math.floor(chainIdToBlockTime[destChainId] * 1.5);
      const finalityBlocks = getFinalityBlocks(originChainId);
      const finalityEstimate = finalityBlocks * (chainIdToBlockTime[originChainId] || 3);

      if (status === MessageStatus.Delivered && destinationTimestamp) {
        // For delivered messages, just to rough estimates for stages
        // This saves us from making extra explorer calls. May want to revisit in future
        const totalDuration = Math.round((destinationTimestamp - originTimestamp) / 1000);
        const finalityDuration = Math.max(
          Math.min(finalityEstimate, totalDuration - VALIDATION_TIME_EST),
          1,
        );
        const remaining = totalDuration - finalityDuration;
        const validateDuration = Math.max(
          Math.min(Math.round(remaining * 0.25), VALIDATION_TIME_EST),
          1,
        );
        const relayDuration = Math.max(remaining - validateDuration, 1);
        return {
          stage: Stage.Relayed,
          timings: {
            [Stage.Finalized]: `${finalityDuration} sec`,
            [Stage.Validated]: `${validateDuration} sec`,
            [Stage.Relayed]: `${relayDuration} sec`,
          },
        };
      }

      // TODO rename?
      const latestNonce = await tryFetchLatestNonce(originChainId);
      if (latestNonce && latestNonce >= nonce) {
        return {
          stage: Stage.Validated,
          timings: {
            [Stage.Finalized]: `${finalityEstimate} sec`,
            [Stage.Validated]: `${VALIDATION_TIME_EST} sec`,
            [Stage.Relayed]: `~${relayEstimate} sec`,
          },
        };
      }

      const latestBlock = await tryFetchChainLatestBlock(originChainId);
      const finalizedBlock = originBlockNumber + finalityBlocks;
      if (latestBlock && BigNumber.from(latestBlock.number).gte(finalizedBlock)) {
        return {
          stage: Stage.Finalized,
          timings: {
            [Stage.Finalized]: `${finalityEstimate} sec`,
            [Stage.Validated]: `~${VALIDATION_TIME_EST} sec`,
            [Stage.Relayed]: `~${relayEstimate} sec`,
          },
        };
      }

      return {
        stage: Stage.Sent,
        timings: {
          [Stage.Finalized]: `~${finalityEstimate} sec`,
          [Stage.Validated]: `~${VALIDATION_TIME_EST} sec`,
          [Stage.Relayed]: `~${relayEstimate} sec`,
        },
      };
    },
  );

  // Show toast on error
  useEffect(() => {
    if (error) {
      logger.error('Error fetching message stage', error);
      toast.warn(`Error building timeline: ${error}`);
    }
  }, [error]);

  return {
    stage: data?.stage || Stage.Sent,
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

async function tryFetchLatestNonce(chainId: number) {
  logger.debug(`Attempting to fetch nonce for:`, chainId);
  try {
    const response = await fetchWithTimeout(
      '/api/latest-nonce',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chainId }),
      },
      3000,
    );
    const result = await response.json();
    logger.debug(`Found nonce:`, result.nonce);
    return result.nonce;
  } catch (error) {
    logger.error('Error fetching nonce', error);
    return null;
  }
}
