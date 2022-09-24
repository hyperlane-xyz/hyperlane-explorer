// Based on debug script in monorepo
// https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/infra/scripts/debug-message.ts
import { IMessageRecipient__factory } from '@hyperlane-xyz/core';
import {
  ChainName,
  Chains,
  DispatchedMessage,
  DomainIdToChainName,
  HyperlaneCore,
  MultiProvider,
  chainConnectionConfigs,
} from '@hyperlane-xyz/sdk';
import { utils } from '@hyperlane-xyz/utils';

import { Environment } from '../../consts/environments';

export async function debugMessageForHash(txHash: string, environment: Environment) {
  const originChain = Chains.ethereum; // TODO check every chain

  // TODO use RPC with api keys
  const multiProvider = new MultiProvider(chainConnectionConfigs);

  const core = HyperlaneCore.fromEnvironment(environment, multiProvider);

  const originProvider = multiProvider.getChainProvider(originChain);
  const dispatchReceipt = await originProvider.getTransactionReceipt(txHash);
  const dispatchedMessages = core.getDispatchedMessages(dispatchReceipt);

  // 1 indexed for human friendly logs
  let currentMessage = 1;
  for (const message of dispatchedMessages) {
    console.log(`Message ${currentMessage} of ${dispatchedMessages.length}...`);
    await checkMessage(core, multiProvider, message);
    console.log('==========');
    currentMessage++;
  }
  console.log(`Evaluated ${dispatchedMessages.length} messages`);
}

async function checkMessage(
  core: HyperlaneCore<any>,
  multiProvider: MultiProvider<any>,
  message: DispatchedMessage,
) {
  console.log(`Leaf index: ${message.leafIndex.toString()}`);
  console.log(`Raw bytes: ${message.message}`);
  console.log('Parsed message:', message.parsed);

  const destinationChain = DomainIdToChainName[message.parsed.destination];

  if (destinationChain === undefined) {
    console.error(`ERROR: Unknown destination domain ${message.parsed.destination}`);
    return;
  }

  console.log(`Destination chain: ${destinationChain}`);

  if (!core.knownChain(destinationChain)) {
    console.error(`ERROR: destination chain ${destinationChain} unknown for environment`);
    return;
  }

  const destinationInbox = core.getMailboxPair(
    DomainIdToChainName[message.parsed.origin],
    destinationChain,
  ).destinationInbox;

  const messageHash = utils.messageHash(message.message, message.leafIndex);
  console.log(`Message hash: ${messageHash}`);

  const processed = await destinationInbox.messages(messageHash);
  if (processed === 1) {
    console.log('Message has already been processed');

    // TODO: look for past events to find the exact tx in which the message was processed.

    return;
  } else {
    console.log('Message not yet processed');
  }

  const recipientAddress = utils.bytes32ToAddress(message.parsed.recipient);
  const recipientIsContract = await isContract(multiProvider, destinationChain, recipientAddress);

  if (!recipientIsContract) {
    console.error(
      `ERROR: recipient address ${recipientAddress} is not a contract, maybe a malformed bytes32 recipient?`,
    );
    return;
  }

  const destinationProvider = multiProvider.getChainProvider(destinationChain);
  const recipient = IMessageRecipient__factory.connect(recipientAddress, destinationProvider);

  try {
    await recipient.estimateGas.handle(
      message.parsed.origin,
      message.parsed.sender,
      message.parsed.body,
      { from: destinationInbox.address },
    );
    console.log('Calling recipient `handle` function from the inbox does not revert');
  } catch (err: any) {
    console.error(`Error calling recipient \`handle\` function from the inbox`);
    if (err.reason) {
      console.error('Reason: ', err.reason);
    } else {
      console.error(err);
    }
  }
}

async function isContract(multiProvider: MultiProvider<any>, chain: ChainName, address: string) {
  const provider = multiProvider.getChainProvider(chain);
  const code = await provider.getCode(address);
  // "Empty" code
  return code && code !== '0x';
}
