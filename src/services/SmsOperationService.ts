import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import {
  db,
  type LocalSmsOperation,
  type SmsSyncQueueItem,
} from '../lib/db';
import type { SmsOperation } from '../types/smsOperation';

const MAX_RETRY_DELAY = 30 * 60 * 1000;
const SYNC_INTERVAL = 30 * 1000;

function getRetryDelay(attempts: number): number {
  const baseDelay = 5000;
  return Math.min(
    baseDelay * Math.pow(2, Math.max(0, attempts - 1)),
    MAX_RETRY_DELAY
  );
}

function toLocalSmsOperation(
  operation: SmsOperation
): LocalSmsOperation {
  const now = Date.now();
  return {
    id: operation.id,
    internalNumberId: operation.internalNumberId,
    agencyId: operation.agencyId,
    operator: operation.operator,
    sender: operation.sender,
    rawMessage: operation.rawMessage,
    transactionReference: operation.transactionReference,
    amount: operation.amount,
    currency: operation.currency,
    transactionType: operation.transactionType,
    operationDate: operation.operationDate,
    receivedAt: operation.receivedAt,
    processedAt: operation.processedAt,
    status: operation.status,
    syncStatus: 'pending',
    createdAt: operation.createdAt || now,
    updatedAt: now,
  };
}

export async function saveSmsOperationLocally(
  operation: SmsOperation
): Promise<void> {
  const localOperation = toLocalSmsOperation(operation);
  await db.transaction(
    'rw',
    db.smsOperations,
    db.smsSyncQueue,
    async () => {
      await db.smsOperations.put(localOperation);
      const existing = await db.smsSyncQueue
        .where('smsOperationId')
        .equals(operation.id)
        .first();

      if (existing) {
        await db.smsSyncQueue.update(existing.id!, {
          status: 'pending',
          lastError: null,
          nextAttemptAt: Date.now(),
          updatedAt: Date.now(),
        });
        return;
      }

      const now = Date.now();
      await db.smsSyncQueue.add({
        smsOperationId: operation.id,
        operation: 'create',
        status: 'pending',
        attempts: 0,
        lastError: null,
        nextAttemptAt: now,
        lastAttemptAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  );
}

export async function getReadySmsQueueItems(): Promise<SmsSyncQueueItem[]> {
  const now = Date.now();
  return db.smsSyncQueue
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((item) => item.nextAttemptAt <= now)
    .sortBy('nextAttemptAt');
}

export async function getPendingSmsOperations(): Promise<LocalSmsOperation[]> {
  const queueItems = await getReadySmsQueueItems();
  const operations: LocalSmsOperation[] = [];
  for (const item of queueItems) {
    const operation = await db.smsOperations.get(item.smsOperationId);
    if (operation) {
      operations.push(operation);
    }
  }
  return operations;
}

export async function recoverStuckSmsQueue(): Promise<number> {
  const stuck = await db.smsSyncQueue
    .where('status')
    .equals('processing')
    .toArray();

  if (stuck.length === 0) {
    return 0;
  }

  const now = Date.now();
  await db.transaction('rw', db.smsSyncQueue, async () => {
    for (const item of stuck) {
      await db.smsSyncQueue.update(item.id!, {
        status: 'failed',
        lastError:
          item.lastError ??
          'Synchronisation interrompue avant sa finalisation.',
        nextAttemptAt: now,
        updatedAt: now,
      });
    }
  });

  return stuck.length;
}

async function markQueueProcessing(
  queueItem: SmsSyncQueueItem
): Promise<void> {
  const now = Date.now();
  await db.smsSyncQueue.update(queueItem.id!, {
    status: 'processing',
    attempts: queueItem.attempts + 1,
    lastAttemptAt: now,
    updatedAt: now,
  });
}

export async function syncSmsOperation(
  operationId: string
): Promise<void> {
  const operation = await db.smsOperations.get(operationId);
  if (!operation) {
    throw new Error(`Opération SMS introuvable : ${operationId}`);
  }

  const queueItem = await db.smsSyncQueue
    .where('smsOperationId')
    .equals(operationId)
    .first();

  if (!queueItem) {
    throw new Error(`Élément de file introuvable pour : ${operationId}`);
  }

  await markQueueProcessing(queueItem);

  try {
    const firestoreRef = doc(firestore, 'smsOperations', operation.id);
    await setDoc(
      firestoreRef,
      {
        id: operation.id,
        internalNumberId: operation.internalNumberId,
        agencyId: operation.agencyId,
        operator: operation.operator,
        sender: operation.sender ?? null,
        rawMessage: operation.rawMessage,
        transactionReference: operation.transactionReference ?? null,
        amount: operation.amount ?? null,
        currency: operation.currency ?? null,
        transactionType: operation.transactionType ?? null,
        operationDate: operation.operationDate ?? null,
        receivedAt: operation.receivedAt,
        processedAt: operation.processedAt ?? null,
        status: operation.status,
        createdAt: operation.createdAt,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const now = Date.now();
    await db.transaction(
      'rw',
      db.smsOperations,
      db.smsSyncQueue,
      async () => {
        await db.smsOperations.update(operation.id, {
          syncStatus: 'synced',
          updatedAt: now,
        });
        await db.smsSyncQueue.update(queueItem.id!, {
          status: 'completed',
          lastError: null,
          updatedAt: now,
        });
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    const currentQueueItem = await db.smsSyncQueue.get(queueItem.id!);
    const attempts =
      currentQueueItem?.attempts ?? queueItem.attempts + 1;
    const delay = getRetryDelay(attempts);
    const nextAttemptAt = Date.now() + delay;

    await db.transaction(
      'rw',
      db.smsOperations,
      db.smsSyncQueue,
      async () => {
        await db.smsOperations.update(operation.id, {
          syncStatus: 'failed',
          updatedAt: Date.now(),
        });
        await db.smsSyncQueue.update(queueItem.id!, {
          status: 'failed',
          lastError: message,
          nextAttemptAt,
          updatedAt: Date.now(),
        });
      }
    );
    throw new Error(`Échec synchronisation SMS : ${message}`);
  }
}

export async function processSmsSyncQueue(): Promise<{
  processed: number;
  failed: number;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  const queue = await getReadySmsQueueItems();
  let processed = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await syncSmsOperation(item.smsOperationId);
      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

export async function syncPendingSmsOperations(): Promise<{
  synced: number;
  failed: number;
}> {
  const result = await processSmsSyncQueue();
  return { synced: result.processed, failed: result.failed };
}

export async function retrySmsOperation(
  operationId: string
): Promise<void> {
  const queueItem = await db.smsSyncQueue
    .where('smsOperationId')
    .equals(operationId)
    .first();

  if (!queueItem) {
    throw new Error(`Opération absente de la file : ${operationId}`);
  }

  await db.smsSyncQueue.update(queueItem.id!, {
    status: 'pending',
    nextAttemptAt: Date.now(),
    lastError: null,
    updatedAt: Date.now(),
  });

  await db.smsOperations.update(operationId, {
    syncStatus: 'pending',
    updatedAt: Date.now(),
  });
}

export async function getSmsSyncQueueItem(
  operationId: string
): Promise<SmsSyncQueueItem | undefined> {
  return db.smsSyncQueue
    .where('smsOperationId')
    .equals(operationId)
    .first();
}

export async function getSmsSyncQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const items = await db.smsSyncQueue.toArray();
  return {
    pending: items.filter((item) => item.status === 'pending').length,
    processing: items.filter((item) => item.status === 'processing').length,
    completed: items.filter((item) => item.status === 'completed').length,
    failed: items.filter((item) => item.status === 'failed').length,
  };
}

let syncWorkerStarted = false;

export function startSmsSyncWorker(): () => void {
  if (syncWorkerStarted) {
    return () => undefined;
  }

  syncWorkerStarted = true;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const run = async () => {
    try {
      await recoverStuckSmsQueue();
      await processSmsSyncQueue();
    } catch {
      // Silencieux pour stabilité
    }
  };

  void run();

  intervalId = setInterval(() => {
    void run();
  }, SYNC_INTERVAL);

  const handleOnline = () => {
    void run();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
    syncWorkerStarted = false;
  };
}

export async function getSmsOperationsByNumber(
  internalNumberId: string
): Promise<LocalSmsOperation[]> {
  return db.smsOperations
    .where('internalNumberId')
    .equals(internalNumberId)
    .reverse()
    .sortBy('receivedAt');
}

export async function getSmsOperationsByAgency(
  agencyId: string
): Promise<LocalSmsOperation[]> {
  return db.smsOperations
    .where('agencyId')
    .equals(agencyId)
    .reverse()
    .sortBy('receivedAt');
}

export async function getRecentSmsOperations(
  limitCount = 50
): Promise<LocalSmsOperation[]> {
  const all = await db.smsOperations.toArray();
  all.sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0));
  return all.slice(0, limitCount);
}
