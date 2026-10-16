import {
  Capacitor,
  type PluginListenerHandle,
} from '@capacitor/core';
import SmsReader, {
  type SmsReceivedEvent,
  type PendingSmsItem,
} from '../plugins/SmsReader';
import {
  saveSmsOperationLocally,
} from './SmsOperationService';
import {
  resolveInternalNumber,
} from './InternalNumberResolver';

let listenerHandle: PluginListenerHandle | null = null;

function generateSmsId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sms_${crypto.randomUUID()}`;
  }
  return `sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

async function processSms(
  event: SmsReceivedEvent | PendingSmsItem
): Promise<void> {
  if (!event.message) {
    return;
  }
  try {
    const receiverPhoneNumber =
      'receiverPhoneNumber' in event
        ? event.receiverPhoneNumber?.trim()
        : undefined;

    if (!receiverPhoneNumber) {
      console.warn(
        '[Ets AMANI] SMS en attente ignoré : numéro professionnel non identifié.'
      );
      return;
    }

    const internalNumber = await resolveInternalNumber(receiverPhoneNumber);
    if (!internalNumber) {
      console.warn(
        '[Ets AMANI] SMS ignoré : numéro non enregistré comme numéro interne.',
        receiverPhoneNumber
      );
      return;
    }

    if (!internalNumber.monitoringEnabled) {
      console.info(
        '[Ets AMANI] SMS reçu sur un numéro dont la surveillance est désactivée.',
        receiverPhoneNumber
      );
      return;
    }

    const now = Date.now();
    await saveSmsOperationLocally({
      id: generateSmsId(),
      internalNumberId: internalNumber.internalNumberId,
      agencyId: internalNumber.agencyId,
      operator: internalNumber.operator,
      sender: event.sender,
      rawMessage: event.message,
      operationDate: event.timestamp,
      receivedAt: now,
      status: 'pending',
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    });

    console.info('[Ets AMANI] SMS enregistré localement.', {
      internalNumberId: internalNumber.internalNumberId,
      phoneNumber: internalNumber.phoneNumber,
      operator: internalNumber.operator,
      agencyId: internalNumber.agencyId,
    });
  } catch (error) {
    console.error(
      '[Ets AMANI] Erreur lors du traitement du SMS :',
      error
    );
  }
}

export async function requestSmsPermissions() {
  if (!Capacitor.isNativePlatform()) {
    return {
      receiveSms: false,
      readSms: false,
      granted: false,
    };
  }
  return SmsReader.requestPermissions();
}

export async function checkSmsPermissions() {
  if (!Capacitor.isNativePlatform()) {
    return {
      receiveSms: false,
      readSms: false,
      granted: false,
    };
  }
  return SmsReader.checkPermissions();
}

async function processPendingSms(): Promise<void> {
  try {
    const result = await SmsReader.getPendingSms();
    if (!result.items || result.items.length === 0) {
      return;
    }
    console.info(`[Ets AMANI] ${result.items.length} SMS en attente détecté(s).`);
    for (const sms of result.items) {
      await processSms(sms);
    }
  } catch (error) {
    console.error(
      '[Ets AMANI] Impossible de récupérer les SMS en attente :',
      error
    );
  }
}

export async function startSmsListener(): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) {
    return async () => {};
  }
  if (listenerHandle) {
    return async () => {};
  }

  await processPendingSms();
  listenerHandle = await SmsReader.addListener(
    'smsReceived',
    async (event: SmsReceivedEvent) => {
      await processSms(event);
    }
  );

  console.info('[Ets AMANI] Listener SMS démarré.');
  return async () => {
    if (listenerHandle) {
      await listenerHandle.remove();
      listenerHandle = null;
      console.info('[Ets AMANI] Listener SMS arrêté.');
    }
  };
}
