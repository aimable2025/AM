export type SmsOperationStatus =
  | 'pending'
  | 'processed'
  | 'matched'
  | 'flagged';

export interface SmsOperation {
  id: string;
  internalNumberId: string;
  agencyId: string | null;
  operator:
    | 'vodacom'
    | 'airtel'
    | 'orange'
    | 'africell';
  sender?: string;
  rawMessage: string;
  transactionReference?: string;
  amount?: number;
  currency?: string;
  transactionType?: string;
  operationDate?: number;
  receivedAt: number;
  processedAt?: number;
  status: SmsOperationStatus;
  syncStatus:
    | 'pending'
    | 'synced'
    | 'failed';
  createdAt: number;
  updatedAt: number;
}
