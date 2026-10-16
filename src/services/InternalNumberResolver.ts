import { db } from '../lib/db';

export interface ResolvedInternalNumber {
  internalNumberId: string;
  phoneNumber: string;
  operator: 'vodacom' | 'airtel' | 'orange' | 'africell';
  agencyId: string | null;
  assignedUserId?: string | null;
  monitoringEnabled: boolean;
}

/**
 * Extrait les 9 derniers chiffres significatifs d'un numéro de téléphone.
 * Permet d'égaliser +243990000000, 0990000000 et 243990000000 sans erreur.
 */
function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return '';
  const digitsOnly = phoneNumber.replace(/[^\d]/g, '');
  if (digitsOnly.length >= 9) {
    return digitsOnly.slice(-9);
  }
  return digitsOnly;
}

export async function resolveInternalNumber(
  phoneNumber: string
): Promise<ResolvedInternalNumber | null> {
  if (!phoneNumber) return null;

  const targetNormalized = normalizePhoneNumber(phoneNumber);
  if (!targetNormalized) {
    return null;
  }

  const numbers = await db.internalNumbers.toArray();
  const match = numbers.find((item) => {
    const localNormalized = normalizePhoneNumber(item.phoneNumber);
    return localNormalized === targetNormalized;
  });

  if (!match) {
    return null;
  }

  return {
    internalNumberId: match.id,
    phoneNumber: match.phoneNumber,
    operator: match.operator,
    agencyId: match.agencyId ?? null,
    assignedUserId: match.assignedUserId ?? null,
    monitoringEnabled: match.monitoringEnabled === true,
  };
}
