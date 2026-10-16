import { db, type LocalReport } from '../lib/db';
import { recordAuditLog } from './AuditService';
import type { AppUser } from '../types/auth';

export interface GenerateReportInput {
  title: string;
  type: LocalReport['type'];
  period: LocalReport['period'];
  startDate?: number;
  endDate?: number;
  agencyId: string | null;
  agencyName: string;
  notes?: string;
}

export function generateReportReference(type: LocalReport['type']): string {
  const prefixMap: Record<LocalReport['type'], string> = {
    financier: 'RPT-FIN',
    operationnel: 'RPT-OPS',
    analytique: 'RPT-ANA',
    cloture_caisse: 'RPT-CAI',
    global: 'RPT-GLB',
  };
  const prefix = prefixMap[type] || 'RPT-GEN';
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

export function resolvePeriodBounds(
  period: LocalReport['period'],
  customStart?: number,
  customEnd?: number
): { startDate: number; endDate: number } {
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  if (period === 'aujourd_hui') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { startDate: start.getTime(), endDate: endOfToday.getTime() };
  }
  if (period === '7_jours') {
    return {
      startDate: now - 7 * 24 * 60 * 60 * 1000,
      endDate: endOfToday.getTime(),
    };
  }
  if (period === '30_jours') {
    return {
      startDate: now - 30 * 24 * 60 * 60 * 1000,
      endDate: endOfToday.getTime(),
    };
  }
  return {
    startDate: customStart || now - 7 * 24 * 60 * 60 * 1000,
    endDate: customEnd || endOfToday.getTime(),
  };
}

/**
 * Calcule les métriques réelles à partir des tables Dexie locales en respectant
 * strictement le périmètre d'agence (RBAC) et la période demandée.
 */
export async function computeReportMetrics(
  effectiveAgencyId: string | null,
  startDate: number,
  endDate: number
): Promise<LocalReport['metrics']> {
  const [billetages, operations, smsOps, debts, transfers] = await Promise.all([
    db.billetages.toArray(),
    db.operations.toArray(),
    db.smsOperations.toArray(),
    db.debts.toArray(),
    db.interAgencyTransfers.toArray(),
  ]);

  const filteredBilletages = billetages.filter((b) => {
    const inPeriod = b.createdAt >= startDate && b.createdAt <= endDate;
    const inAgency = !effectiveAgencyId || b.agencyId === effectiveAgencyId;
    return inPeriod && inAgency && b.status !== 'cancelled';
  });

  let totalBilletageUSD = 0;
  let totalBilletageCDF = 0;
  let totalDiscrepancyUSD = 0;
  let totalDiscrepancyCDF = 0;

  for (const b of filteredBilletages) {
    const amount = Number(b.calculatedTotal || b.declaredAmount || 0);
    const disc = Number(b.discrepancy || 0);
    if (b.currency === 'USD') {
      totalBilletageUSD += amount;
      totalDiscrepancyUSD += disc;
    } else if (b.currency === 'CDF') {
      totalBilletageCDF += amount;
      totalDiscrepancyCDF += disc;
    }
  }

  const filteredOps = operations.filter((op) => {
    const inPeriod = op.createdAt >= startDate && op.createdAt <= endDate;
    const inAgency = !effectiveAgencyId || op.agencyId === effectiveAgencyId;
    return inPeriod && inAgency;
  });

  let operationsCompleted = 0;
  let operationsPending = 0;
  let operationsAmountUSD = 0;
  let operationsAmountCDF = 0;

  for (const op of filteredOps) {
    if (op.status === 'termine' || op.status === 'valide') {
      operationsCompleted += 1;
    } else if (op.status !== 'annule' && op.status !== 'rejete') {
      operationsPending += 1;
    }
    const amt = Number(op.amount || 0);
    if (op.currency === 'USD') {
      operationsAmountUSD += amt;
    } else if (op.currency === 'CDF') {
      operationsAmountCDF += amt;
    }
  }

  const filteredSms = smsOps.filter((s) => {
    const inPeriod = s.receivedAt >= startDate && s.receivedAt <= endDate;
    const inAgency = !effectiveAgencyId || s.agencyId === effectiveAgencyId;
    return inPeriod && inAgency;
  });

  const filteredDebts = debts.filter((d) => {
    const inAgency = !effectiveAgencyId || d.agencyId === effectiveAgencyId;
    return inAgency && d.status !== 'rembourse';
  });

  let activeDebtsUSD = 0;
  let activeDebtsCDF = 0;
  for (const d of filteredDebts) {
    if (d.currency === 'USD') activeDebtsUSD += Number(d.remainingAmount || 0);
    if (d.currency === 'CDF') activeDebtsCDF += Number(d.remainingAmount || 0);
  }

  const filteredTransfers = transfers.filter((t) => {
    const inPeriod = t.createdAt >= startDate && t.createdAt <= endDate;
    return inPeriod && (t.status === 'valide' || t.status === 'recu');
  });

  let transfersInUSD = 0;
  let transfersOutUSD = 0;
  let transfersInCDF = 0;
  let transfersOutCDF = 0;

  for (const t of filteredTransfers) {
    const isOut = !effectiveAgencyId || t.sourceAgencyId === effectiveAgencyId;
    const isIn = !effectiveAgencyId || t.targetAgencyId === effectiveAgencyId;

    if (effectiveAgencyId) {
      if (isIn) {
        if (t.currency === 'USD') transfersInUSD += t.amount;
        if (t.currency === 'CDF') transfersInCDF += t.amount;
      }
      if (isOut) {
        if (t.currency === 'USD') transfersOutUSD += t.amount;
        if (t.currency === 'CDF') transfersOutCDF += t.amount;
      }
    } else {
      // Vue consolidée réseau global : flux total transféré
      if (t.currency === 'USD') {
        transfersInUSD += t.amount;
        transfersOutUSD += t.amount;
      }
      if (t.currency === 'CDF') {
        transfersInCDF += t.amount;
        transfersOutCDF += t.amount;
      }
    }
  }

  const netTreasuryUSD =
    totalBilletageUSD +
    (effectiveAgencyId ? transfersInUSD - transfersOutUSD : 0);
  const netTreasuryCDF =
    totalBilletageCDF +
    (effectiveAgencyId ? transfersInCDF - transfersOutCDF : 0);

  return {
    totalBilletageUSD,
    totalBilletageCDF,
    totalDiscrepancyUSD,
    totalDiscrepancyCDF,
    billetageCount: filteredBilletages.length,
    operationsTotal: filteredOps.length,
    operationsCompleted,
    operationsPending,
    operationsAmountUSD,
    operationsAmountCDF,
    smsOperationsCount: filteredSms.length,
    activeDebtsUSD,
    activeDebtsCDF,
    transfersInUSD,
    transfersOutUSD,
    transfersInCDF,
    transfersOutCDF,
    netTreasuryUSD,
    netTreasuryCDF,
  };
}

/**
 * Récupère les rapports autorisés pour l'utilisateur courant selon le RBAC.
 * - Directeur Général & Administrateur Système : accès global ou filtré par agence
 * - Administrateur d'agence : strictement limité à son agencyId
 */
export async function getAuthorizedReports(
  user: AppUser | null
): Promise<LocalReport[]> {
  if (!user) return [];
  const all = await db.reports.toArray();
  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const visible = isGlobalRole
    ? all
    : all.filter((r) => user.agencyId && r.agencyId === user.agencyId);

  return visible.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Génère et stocke un rapport en mode Offline-First (Dexie + syncQueue + AuditService).
 */
export async function generateAndSaveReport(
  input: GenerateReportInput,
  user: AppUser
): Promise<LocalReport> {
  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  // Isolation RBAC stricte : un Administrateur d'agence ne peut générer que pour son agence
  const enforcedAgencyId = isGlobalRole
    ? input.agencyId
    : user.agencyId || null;

  if (!isGlobalRole && !enforcedAgencyId) {
    throw new Error(
      "Accès refusé : votre profil d'agence ne possède pas d'identifiant d'agence valide."
    );
  }

  const { startDate, endDate } = resolvePeriodBounds(
    input.period,
    input.startDate,
    input.endDate
  );

  const metrics = await computeReportMetrics(
    enforcedAgencyId,
    startDate,
    endDate
  );

  const now = Date.now();
  const id = `rep-${now}-${Math.random().toString(36).substring(2, 8)}`;
  const reference = generateReportReference(input.type);

  const summary = `Synthèse ${input.type.replace('_', ' ')} (${input.agencyName}) : Caisse nette ${metrics.netTreasuryUSD.toLocaleString('fr-FR')} USD / ${metrics.netTreasuryCDF.toLocaleString('fr-FR')} CDF • ${metrics.operationsCompleted}/${metrics.operationsTotal} opérations exécutées • ${metrics.billetageCount} billetage(s).`;

  const newReport: LocalReport = {
    id,
    reference,
    title: input.title.trim(),
    type: input.type,
    period: input.period,
    startDate,
    endDate,
    agencyId: enforcedAgencyId,
    agencyName: input.agencyName || (enforcedAgencyId ? enforcedAgencyId : 'Toutes les Agences (Consolidé)'),
    status: 'brouillon',
    summary,
    metrics,
    notes: input.notes?.trim() || '',
    createdBy: user.uid,
    createdByName: user.displayName || user.email || 'Utilisateur',
    createdByRole: user.role,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.reports.put(newReport);

  await db.syncQueue.add({
    entity: 'report',
    entityId: id,
    operation: 'create',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Génération de rapport officiel',
    category: 'operations',
    severity: 'info',
    details: `Rapport ${reference} (« ${newReport.title} ») généré pour ${newReport.agencyName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId: id,
      reference,
      type: input.type,
      agencyId: enforcedAgencyId,
    },
  });

  return newReport;
}

/**
 * Change le statut d'un rapport (brouillon -> valide -> archive) avec contrôle RBAC et Audit.
 */
export async function updateReportStatus(
  reportId: string,
  nextStatus: LocalReport['status'],
  user: AppUser
): Promise<void> {
  const existing = await db.reports.get(reportId);
  if (!existing) {
    throw new Error('Rapport introuvable.');
  }

  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  if (!isGlobalRole && existing.agencyId !== user.agencyId) {
    throw new Error('Violation RBAC : ce rapport appartient à une autre agence.');
  }

  const now = Date.now();
  await db.reports.update(reportId, {
    status: nextStatus,
    syncStatus: 'pending',
    updatedAt: now,
  });

  await db.syncQueue.add({
    entity: 'report',
    entityId: reportId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: `Changement statut rapport (${nextStatus})`,
    category: 'operations',
    severity: nextStatus === 'valide' ? 'security' : 'info',
    details: `Rapport ${existing.reference} passé au statut « ${nextStatus} » par ${user.displayName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId,
      reference: existing.reference,
      status: nextStatus,
      agencyId: existing.agencyId,
    },
  });
}

/**
 * Export réel au format Excel (.csv compatible Microsoft Excel avec BOM UTF-8)
 * en respectant l'isolation d'agence et en journalisant l'export dans AuditService.
 */
export async function exportReportsToExcel(
  reports: LocalReport[],
  user: AppUser,
  filterLabel: string
): Promise<void> {
  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const authorizedRows = isGlobalRole
    ? reports
    : reports.filter((r) => user.agencyId && r.agencyId === user.agencyId);

  const headers = [
    'Référence',
    'Titre',
    'Type',
    'Agence',
    'Période Début',
    'Période Fin',
    'Statut',
    'Billetage USD',
    'Billetage CDF',
    'Écart Caisse USD',
    'Écart Caisse CDF',
    'Opérations Totales',
    'Opérations Terminées',
    'Volume Opérations USD',
    'Volume Opérations CDF',
    'Flux SMS Opérateurs',
    'Dettes Actives USD',
    'Dettes Actives CDF',
    'Trésorerie Nette USD',
    'Trésorerie Nette CDF',
    'Créé par',
    'Date Création',
  ];

  const escapeCsv = (val: string | number | null | undefined) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines = [
    headers.map(escapeCsv).join(';'),
    ...authorizedRows.map((r) =>
      [
        r.reference,
        r.title,
        r.type,
        r.agencyName,
        new Date(r.startDate).toLocaleDateString('fr-FR'),
        new Date(r.endDate).toLocaleDateString('fr-FR'),
        r.status,
        r.metrics.totalBilletageUSD.toFixed(2),
        r.metrics.totalBilletageCDF.toFixed(0),
        r.metrics.totalDiscrepancyUSD.toFixed(2),
        r.metrics.totalDiscrepancyCDF.toFixed(0),
        r.metrics.operationsTotal,
        r.metrics.operationsCompleted,
        r.metrics.operationsAmountUSD.toFixed(2),
        r.metrics.operationsAmountCDF.toFixed(0),
        r.metrics.smsOperationsCount,
        r.metrics.activeDebtsUSD.toFixed(2),
        r.metrics.activeDebtsCDF.toFixed(0),
        r.metrics.netTreasuryUSD.toFixed(2),
        r.metrics.netTreasuryCDF.toFixed(0),
        r.createdByName,
        new Date(r.createdAt).toLocaleString('fr-FR'),
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  // BOM UTF-8 pour ouverture directe dans Microsoft Excel avec accents et colonnes
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Ets-AMANI-Rapports-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  await recordAuditLog({
    action: 'Export Excel (.CSV) des Rapports',
    category: 'operations',
    severity: 'info',
    details: `Export Excel de ${authorizedRows.length} rapport(s) effectué par ${user.displayName} (${filterLabel}).`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      exportedCount: authorizedRows.length,
      filterLabel,
      agencyId: user.agencyId || 'ALL',
    },
  });
}

/**
 * Déclenche l'export PDF officiel (via le moteur d'impression natif @media print)
 * et enregistre la trace d'audit.
 */
export async function auditPdfExport(
  report: LocalReport,
  user: AppUser
): Promise<void> {
  await recordAuditLog({
    action: 'Export PDF Rapport Officiel',
    category: 'operations',
    severity: 'info',
    details: `Export PDF du rapport ${report.reference} (« ${report.title} ») pour ${report.agencyName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: {
      reportId: report.id,
      reference: report.reference,
      agencyId: report.agencyId,
    },
  });
  window.print();
}
