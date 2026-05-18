import { IcaCall } from '../../../types';

/**
 * ICA Message Types (from InterchainAccountMessage.sol)
 */
export enum IcaMessageType {
  CALLS = 0,
  COMMITMENT = 1,
  REVEAL = 2,
}

/**
 * Decoded ICA message with all fields
 */
export interface DecodedIcaMessage {
  messageType: IcaMessageType;
  owner: string; // bytes32 -> address
  ism: string; // bytes32 -> address
  salt: string; // bytes32 hex
  calls: IcaCall[]; // Only present for CALLS type
  commitment?: string; // Only present for COMMITMENT type
}

export interface DecodedIcaCallData {
  functionName: string;
  summary: string;
  details?: Array<{ label: string; value: string }>;
  swap?: {
    tokenIn: string;
    tokenOut: string;
    tokenOutType?: 'token' | 'native';
    outputAmount?: string;
    outputAmountKind?: 'exact' | 'minimum';
    wrappedNativeToken?: string;
    outputRecipients?: string[];
  };
}
