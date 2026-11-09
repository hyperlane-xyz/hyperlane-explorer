import { useMemo } from 'react';
import { useQuery } from 'urql';

import { API_GRAPHQL_QUERY_LIMIT } from '../../consts/api';
import type { MessageStub } from '../../types';
import { postgresByteaToString, stringToPostgresBytea } from './queries/encoding';
import type { MessageStubEntry } from './queries/fragments';
import { classifySwapMessages, readSwapEnvelope, type SwapMessage } from './swapMessages';

const relatedCommitmentsQuery = `query ($hashes: [bytea!]!) {
  message_view(confirmations: 0, where: {origin_tx_hash: {_in: $hashes}}, limit: ${API_GRAPHQL_QUERY_LIMIT}) {
    msg_id message_body sender recipient origin_domain_id destination_domain_id origin_tx_hash
  }
}`;
type RelatedMessage = Pick<
  MessageStubEntry,
  | 'msg_id'
  | 'message_body'
  | 'sender'
  | 'recipient'
  | 'origin_domain_id'
  | 'destination_domain_id'
  | 'origin_tx_hash'
>;

export function useSwapMessageApplications(
  messages: MessageStub[],
  bridgeMessageIds: ReadonlySet<string>,
) {
  const known = useMemo(
    () => classifySwapMessages(messages, bridgeMessageIds),
    [messages, bridgeMessageIds],
  );
  const hashes = useMemo(
    () =>
      [
        ...new Set(
          messages
            .filter(
              (message) =>
                !known.has(message.msgId) &&
                (readSwapEnvelope(message)?.stage === 'Reveal' ||
                  bridgeMessageIds.has(message.msgId)) &&
                /^0x[0-9a-f]{64}$/i.test(message.origin.hash),
            )
            .map((message) => stringToPostgresBytea(message.origin.hash)),
        ),
      ].sort(),
    [messages, known, bridgeMessageIds],
  );
  // Ownerless reveals and bridge transfers need their commitment. Batch once for the table;
  // never query each row or block the overview while the commitment is loading.
  const [{ data }] = useQuery<{ message_view: RelatedMessage[] }>({
    query: relatedCommitmentsQuery,
    variables: { hashes },
    pause: hashes.length === 0,
  });
  return useMemo(() => {
    const related: SwapMessage[] = (data?.message_view ?? [])
      .filter((row) => row.message_body !== null)
      .map((row) => ({
        msgId: postgresByteaToString(row.msg_id),
        body: postgresByteaToString(row.message_body!),
        sender: postgresByteaToString(row.sender),
        recipient: postgresByteaToString(row.recipient),
        originDomainId: row.origin_domain_id,
        destinationDomainId: row.destination_domain_id,
        origin: { hash: postgresByteaToString(row.origin_tx_hash) },
      }));
    return related.length
      ? classifySwapMessages([...messages, ...related], bridgeMessageIds)
      : known;
  }, [messages, known, data, bridgeMessageIds]);
}
