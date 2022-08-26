// Model for messages on the server db
export interface MessageDbEntry {
  id: string;
  status: string;
  sender: string;
  recipient: string;
  body: string;
  originchainid: number;
  origintimesent: number;
  destinationchainid: number;
  destinationtimesent: number;
}

export interface MessagesQueryResult {
  messages: MessageDbEntry[];
}
