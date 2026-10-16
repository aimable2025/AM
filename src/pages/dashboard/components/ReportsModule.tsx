import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Coins,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { type LocalReport } from '../../../lib/db';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import {
  auditPdfExport,
  computeReportMetrics,
  exportReportsToExcel,
  generateAndSaveReport,
  getAuthorizedReports,
  resolvePeriodBounds,
  updateReportStatus,
} from '../../../services/ReportService';
import { triggerSyncNow } from '../../../services/SyncWorker';

interface ReportsModuleProps {
  onClose?: () => void;
}

const REPORT_TYPE_LABELS: Record<LocalReport['type'], string> = {
  financier: 'Synthèse Financière & Trésorerie',
  operationnel: 'Synthèse Opérationnelle & Missions',
  analytique: 'Rapport Analytique & Performance',
  cloture_caisse: 'Procès-Verbal de Clôture de Caisse',
  global: 'Rapport Exécutif Consolidé',
};

const PERIOD_LABELS: Record<LocalReport['period'], string> = {
  aujourd_hui: "Aujourd'hui (Journée en cours)",
  '7_jours': '7 derniers jours',
  '30_jours': '30 derniers jours (Mensuel)',
  personnalise: 'Période personnalisée',
};

export default function ReportsModule({ onClose }: ReportsModuleProps) {
  const { user } = useAuth();
  const isGlobalRole =
    user?.role === 'administrateur_systeme' || user?.role === 'directeur_general';

  const [reports, setReports] = useState<LocalReport[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtres de consultation
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>(
    isGlobalRole ? 'all' : user?.agencyId || 'all'
  );

  // Formulaire de génération
  const [showGenerator, setShowGenerator] = useState(false);
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<LocalReport['type']>('financier');
  const [period, setPeriod] = useState<LocalReport['period']>('aujourd_hui');
  const [customStart, setCustomStart] = useState<string>(
    new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [targetAgencyId, setTargetAgencyId] = useState<string>(
    isGlobalRole ? 'ALL' : user?.agencyId || ''
  );
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Prévisualisation temps réel des métriques avant génération
  const [previewMetrics, setPreviewMetrics] = useState<LocalReport['metrics'] | null>(null);

  // Rapport sélectionné pour consultation détaillée / impression PDF
  const [selectedReport, setSelectedReport] = useState<LocalReport | null>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [repList, agList] = await Promise.all([
        getAuthorizedReports(user),
        getAgencies(),
      ]);
      setReports(repList);
      setAgencies(agList);
      if (selectedReport) {
        const updated = repList.find((r) => r.id === selectedReport.id);
        if (updated) setSelectedReport(updated);
      }
    } catch (err) {
      console.warn('[Ets AMANI] Chargement des rapports :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.uid, user?.agencyId]);

  // Recalcul de l'aperçu en direct lorsque le générateur est ouvert
  useEffect(() => {
    if (!showGenerator || !user) return;
    const effectiveAgency = isGlobalRole
      ? targetAgencyId === 'ALL'
        ? null
        : targetAgencyId
      : user.agencyId || null;

    const bounds = resolvePeriodBounds(
      period,
      customStart ? new Date(customStart).getTime() : undefined,
      customEnd ? new Date(customEnd + 'T23:59:59').getTime() : undefined
    );

    computeReportMetrics(effectiveAgency, bounds.startDate, bounds.endDate)
      .then(setPreviewMetrics)
      .catch(() => setPreviewMetrics(null));
  }, [showGenerator, period, customStart, customEnd, targetAgencyId, isGlobalRole, user]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Sécurité RBAC : un Admin d'agence ne voit jamais une autre agence
      if (!isGlobalRole && user?.agencyId && r.agencyId !== user.agencyId) {
        return false;
      }
      if (isGlobalRole && agencyFilter !== 'all') {
        if (agencyFilter === 'GLOBAL_ONLY' && r.agencyId !== null) return false;
        if (agencyFilter !== 'GLOBAL_ONLY' && r.agencyId !== agencyFilter) return false;
      }
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.reference.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.agencyName.toLowerCase().includes(q) ||
        r.createdByName.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q)
      );
    });
  }, [reports, isGlobalRole, user?.agencyId, agencyFilter, typeFilter, statusFilter, search]);

  const resolveAgencyLabel = (agId: string | null): string => {
    if (!agId || agId === 'ALL') return 'Toutes les Agences (Consolidé Réseau)';
    const found = agencies.find((a) => a.id === agId);
    return found ? `${found.name} (${found.code})` : agId;
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const effectiveAgencyId = isGlobalRole
        ? targetAgencyId === 'ALL'
          ? null
          : targetAgencyId
        : user.agencyId || null;

      const agencyName = resolveAgencyLabel(effectiveAgencyId);
      const defaultTitle =
        title.trim() ||
        `${REPORT_TYPE_LABELS[reportType]} — ${new Date().toLocaleDateString('fr-FR')}`;

      const created = await generateAndSaveReport(
        {
          title: defaultTitle,
          type: reportType,
          period,
          startDate: customStart ? new Date(customStart).getTime() : undefined,
          endDate: customEnd ? new Date(customEnd + 'T23:59:59').getTime() : undefined,
          agencyId: effectiveAgencyId,
          agencyName,
          notes,
        },
        user
      );

      setTitle('');
      setNotes('');
      setShowGenerator(false);
      setSelectedReport(created);
      setFeedback(`Rapport ${created.reference} généré et mis en file de synchronisation.`);
      setTimeout(() => setFeedback(null), 4000);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Erreur lors de la génération du rapport.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStatusUpdate = async (
    rep: LocalReport,
    nextStatus: LocalReport['status']
  ) => {
    if (!user) return;
    try {
      await updateReportStatus(rep.id, nextStatus, user);
      setFeedback(`Statut du rapport ${rep.reference} passé à « ${nextStatus} ».`);
      setTimeout(() => setFeedback(null), 3500);
      await loadData();
      void triggerSyncNow();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Impossible de modifier le statut.'
      );
    }
  };

  const handleExportExcel = async () => {
    if (!user) return;
    await exportReportsToExcel(
      filteredReports,
      user,
      `Filtre: ${typeFilter} / Agence: ${isGlobalRole ? agencyFilter : user.agencyId}`
    );
    setFeedback(`Export Excel (.CSV) de ${filteredReports.length} rapport(s) téléchargé.`);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handlePrintPdf = async (rep: LocalReport) => {
    if (!user) return;
    setSelectedReport(rep);
    setTimeout(() => {
      void auditPdfExport(rep, user);
    }, 150);
  };

  return (
    <div className="space-y-6">
      {/* En-tête du Module Rapport */}
      <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md">
              <FileText className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  Centre de Rapports & Synthèses Ets AMANI
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  Offline-First • RBAC Actif
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {isGlobalRole
                  ? 'Accès Direction Générale / Système : génération et consolidation multi-agences ou par succursale.'
                  : `Périmètre isolé : données strictement limitées à votre agence (${resolveAgencyLabel(user?.agencyId || null)}).`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGenerator((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
            >
              <Plus className="h-4 w-4" />
              {showGenerator ? 'Fermer le générateur' : 'Nouveau Rapport'}
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={filteredReports.length === 0}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Export Excel ({filteredReports.length})
            </button>
            <button
              type="button"
              onClick={loadData}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100"
                title="Fermer le module"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Formulaire de génération d'un rapport avec aperçu temps réel */}
        {showGenerator && (
          <form
            onSubmit={handleGenerateReport}
            className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Générer un nouveau rapport certifié
                </h3>
                <p className="text-xs text-slate-500">
                  Calcul automatique depuis les caisses (Billetages), Opérations, SMS Mobile Money, Dettes et Transferts.
                </p>
              </div>
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
                Traçabilité Audit Active
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Type de rapport
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as LocalReport['type'])}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="financier">Synthèse Financière & Trésorerie</option>
                  <option value="operationnel">Synthèse Opérationnelle & Missions</option>
                  <option value="analytique">Rapport Analytique & Performance</option>
                  <option value="cloture_caisse">Procès-Verbal de Clôture de Caisse</option>
                  {isGlobalRole && (
                    <option value="global">Rapport Exécutif Consolidé Réseau</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Période d'analyse
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as LocalReport['period'])}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="aujourd_hui">Aujourd'hui</option>
                  <option value="7_jours">7 derniers jours</option>
                  <option value="30_jours">30 derniers jours</option>
                  <option value="personnalise">Période personnalisée</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Périmètre Agence (RBAC)
                </label>
                {isGlobalRole ? (
                  <select
                    value={targetAgencyId}
                    onChange={(e) => setTargetAgencyId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    <option value="ALL">Toutes les Agences (Consolidé)</option>
                    {agencies.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} ({ag.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={resolveAgencyLabel(user?.agencyId || null)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Intitulé personnalisé (optionnel)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Arrêté hebdomadaire Agence Goma..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            {period === 'personnalise' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date de début
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date de fin
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Aperçu temps réel des chiffres calculés */}
            {previewMetrics && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Aperçu en temps réel des données sur la période sélectionnée
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <span className="text-[11px] text-slate-500">Billetages comptés</span>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900">
                      ${previewMetrics.totalBilletageUSD.toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-emerald-600">
                      {previewMetrics.totalBilletageCDF.toLocaleString('fr-FR')} CDF ({previewMetrics.billetageCount})
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <span className="text-[11px] text-slate-500">Opérations exécutées</span>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900">
                      {previewMetrics.operationsCompleted} / {previewMetrics.operationsTotal}
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-blue-600">
                      ${previewMetrics.operationsAmountUSD.toLocaleString('fr-FR')} • {previewMetrics.smsOperationsCount} SMS
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <span className="text-[11px] text-slate-500">Encours Dettes</span>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-amber-700">
                      ${previewMetrics.activeDebtsUSD.toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-amber-600">
                      {previewMetrics.activeDebtsCDF.toLocaleString('fr-FR')} CDF
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-50/70 p-3">
                    <span className="text-[11px] font-semibold text-emerald-800">Trésorerie Nette</span>
                    <p className="mt-0.5 text-sm font-black tabular-nums text-emerald-950">
                      ${previewMetrics.netTreasuryUSD.toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[11px] font-bold tabular-nums text-emerald-700">
                      {previewMetrics.netTreasuryCDF.toLocaleString('fr-FR')} CDF
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observations, notes d'audit ou recommandations (optionnel)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations de clôture, justification d'écarts éventuels..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGenerator(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isGenerating}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <FileText className="h-4 w-4 text-emerald-400" />
                {isGenerating ? 'Génération en cours...' : 'Générer et Enregistrer le Rapport'}
              </button>
            </div>
          </form>
        )}

        {/* Barre de filtres et recherche */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par référence, titre, auteur..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <option value="all">Tous les types de rapports</option>
            <option value="financier">Financier & Trésorerie</option>
            <option value="operationnel">Opérationnel & Missions</option>
            <option value="analytique">Analytique & Performance</option>
            <option value="cloture_caisse">Clôture de Caisse</option>
            <option value="global">Exécutif Consolidé</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <option value="all">Tous les statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="valide">Validé & Certifié</option>
            <option value="archive">Archivé</option>
          </select>

          {isGlobalRole ? (
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="all">Toutes les agences</option>
              <option value="GLOBAL_ONLY">Consolidé Réseau uniquement</option>
              {agencies.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.code})
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
              <Building2 className="h-4 w-4 text-slate-500" />
              <span className="truncate">{resolveAgencyLabel(user?.agencyId || null)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Vue détaillée & Fiche d'impression PDF Officielle */}
      {selectedReport && (
        <div className="rounded-3xl border border-slate-300 bg-white p-6 shadow-lg sm:p-8">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                  {selectedReport.reference}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    selectedReport.status === 'valide'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedReport.status === 'archive'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedReport.status === 'valide'
                    ? 'Rapport Certifié & Validé'
                    : selectedReport.status === 'archive'
                      ? 'Archivé'
                      : 'Brouillon'}
                </span>
                <span className="text-xs text-slate-400">
                  Sync: {selectedReport.syncStatus}
                </span>
              </div>
              <h3 className="mt-2 text-lg font-black text-slate-900 sm:text-2xl">
                {selectedReport.title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Périmètre : <strong>{selectedReport.agencyName}</strong> • Période du{' '}
                {new Date(selectedReport.startDate).toLocaleDateString('fr-FR')} au{' '}
                {new Date(selectedReport.endDate).toLocaleDateString('fr-FR')}
              </p>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              {selectedReport.status === 'brouillon' && (
                <button
                  type="button"
                  onClick={() => handleStatusUpdate(selectedReport, 'valide')}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Valider & Certifier
                </button>
              )}
              {selectedReport.status === 'valide' && (
                <button
                  type="button"
                  onClick={() => handleStatusUpdate(selectedReport, 'archive')}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="h-4 w-4" />
                  Archiver
                </button>
              )}
              <button
                type="button"
                onClick={() => handlePrintPdf(selectedReport)}
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Printer className="h-4 w-4 text-amber-400" />
                Exporter PDF / Imprimer
              </button>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Corps du rapport officiel */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase text-slate-400">
                Billetage & Caisse
              </span>
              <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                ${selectedReport.metrics.totalBilletageUSD.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold tabular-nums text-emerald-700">
                {selectedReport.metrics.totalBilletageCDF.toLocaleString('fr-FR')} CDF
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {selectedReport.metrics.billetageCount} comptage(s) • Écart USD :{' '}
                {selectedReport.metrics.totalDiscrepancyUSD.toLocaleString('fr-FR')}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase text-slate-400">
                Activité Opérationnelle
              </span>
              <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                {selectedReport.metrics.operationsCompleted} / {selectedReport.metrics.operationsTotal}
              </p>
              <p className="text-xs font-bold tabular-nums text-blue-700">
                Vol: ${selectedReport.metrics.operationsAmountUSD.toLocaleString('fr-FR')} •{' '}
                {selectedReport.metrics.operationsAmountCDF.toLocaleString('fr-FR')} CDF
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {selectedReport.metrics.operationsPending} en cours •{' '}
                {selectedReport.metrics.smsOperationsCount} SMS Mobile Money
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase text-slate-400">
                Flux Inter-Agences & Dettes
              </span>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
                Entrées : +${selectedReport.metrics.transfersInUSD.toLocaleString('fr-FR')} / Sorties : -$
                {selectedReport.metrics.transfersOutUSD.toLocaleString('fr-FR')}
              </p>
              <p className="mt-1 text-xs font-semibold tabular-nums text-amber-700">
                Créances/Dettes : ${selectedReport.metrics.activeDebtsUSD.toLocaleString('fr-FR')} •{' '}
                {selectedReport.metrics.activeDebtsCDF.toLocaleString('fr-FR')} CDF
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <span className="text-xs font-bold uppercase text-emerald-800">
                Position Nette Trésorerie
              </span>
              <p className="mt-1 text-xl font-black tabular-nums text-emerald-950">
                ${selectedReport.metrics.netTreasuryUSD.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold tabular-nums text-emerald-700">
                {selectedReport.metrics.netTreasuryCDF.toLocaleString('fr-FR')} CDF
              </p>
              <p className="mt-1 text-[11px] text-emerald-800">
                Solde consolidé vérifié
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-2">
            <p className="font-bold text-slate-900">Synthèse automatique :</p>
            <p>{selectedReport.summary}</p>
            {selectedReport.notes && (
              <div className="pt-2 border-t border-slate-200">
                <p className="font-bold text-slate-900">Notes & Observations :</p>
                <p className="mt-0.5 whitespace-pre-line">{selectedReport.notes}</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Établi par : <strong>{selectedReport.createdByName}</strong> ({selectedReport.createdByRole}) le{' '}
              {new Date(selectedReport.createdAt).toLocaleString('fr-FR')}
            </div>
            <div className="font-semibold text-slate-700">
              Visa Direction Générale / Contrôle Interne Ets AMANI
            </div>
          </div>
        </div>
      )}

      {/* Liste des rapports enregistrés */}
      <div className="no-print rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Historique des Rapports ({filteredReports.length})
            </h3>
            <p className="text-xs text-slate-500">
              Stockés localement dans IndexedDB (Dexie) et synchronisés avec Firestore (`reports`)
            </p>
          </div>
        </div>

        {filteredReports.length === 0 ? (
          <div className="py-12 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">
              Aucun rapport pour ces critères
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Cliquez sur « Nouveau Rapport » pour générer un état financier, opérationnel ou analytique.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {filteredReports.map((rep) => (
              <div
                key={rep.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {rep.reference}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {REPORT_TYPE_LABELS[rep.type]}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        rep.status === 'valide'
                          ? 'bg-emerald-100 text-emerald-800'
                          : rep.status === 'archive'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rep.status}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      • {rep.agencyName}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{rep.title}</p>
                  <p className="text-xs text-slate-500">{rep.summary}</p>
                  <p className="text-[11px] text-slate-400">
                    Par {rep.createdByName} • {new Date(rep.createdAt).toLocaleString('fr-FR')} • Sync:{' '}
                    <span className="font-semibold">{rep.syncStatus}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedReport(rep)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    Consulter
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintPdf(rep)}
                    className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <Printer className="h-3.5 w-3.5 text-amber-400" />
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
