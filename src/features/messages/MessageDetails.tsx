import dynamic from 'next/dynamic';
import { Message, MessageStub } from '../../types';
import { MessageDetailsLoading } from './MessageDetailsLoading';

interface Props {
  messageId: string;
  message?: Message | MessageStub;
}

const MessageDetailsInner = dynamic(
  () => import('./MessageDetailsInner').then((mod) => mod.MessageDetailsInner),
  { loading: () => <MessageDetailsLoading /> },
);

export function MessageDetails(props: Props) {
  return <MessageDetailsInner {...props} />;
}
