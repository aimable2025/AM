import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SmsPermissionStatus {
  receiveSms: boolean;
  readSms: boolean;
  granted: boolean;
}

export interface SmsReceivedEvent {
  sender?: string;
  message: string;
  timestamp: number;
  subscriptionId?: number;
  receiverPhoneNumber?: string;
}

export interface PendingSmsItem {
  sender?: string;
  message: string;
  timestamp: number;
  subscriptionId?: number;
  receiverPhoneNumber?: string;
}

export interface SmsReaderPlugin {
  checkPermissions(): Promise<SmsPermissionStatus>;
  requestPermissions(): Promise<{
    requested: boolean;
  }>;
  getPendingSms(): Promise<{
    items: PendingSmsItem[];
  }>;
  addListener(
    eventName: 'smsReceived',
    listenerFunc: (event: SmsReceivedEvent) => void
  ): Promise<PluginListenerHandle>;
}

const SmsReader = registerPlugin<SmsReaderPlugin>('SmsReader');

export default SmsReader;
