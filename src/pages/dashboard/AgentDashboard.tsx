import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Scale,
  Search,
  Smartphone,
  Users,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import WorkspaceNavigationHeader, {
  type WorkspaceTab,
} from '../../components/dashboard/WorkspaceNavigationHeader';
import BilletageModule from './components/BilletageModule';
import ChatModule from './components/ChatModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import ReportsModule from './components/ReportsModule';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { triggerSyncNow } from '../../services/SyncWorker';
import type { Operation } from '../../types/operation';

type AgentView = 'overview' | 'billetage' | 'salary' | 'transfers' | 'debts' | 'chat' | 'reports';

const AGENT_TABS: WorkspaceTab[] = [
  { id: 'overview', label: 'Guichet & Missions', icon: LayoutDashboard },
  { id: 'reports', label: 'Mes Rapports', icon: FileText },
  { id: 'billetage', label: 'Billetage Caisse', icon: Coins },
  { id: 'salary', label: 'Mon Salaire', icon: WalletCards },
  { id: 'transfers', label: 'Transferts Inter-Agences', icon: ArrowLeftRight },
  { id: 'debts', label: 'Suivi Dettes', icon: Scale },
  { id: 'chat', label: 'Messagerie & Annonces', icon: Users },
];

export default function AgentDashboard() {
  const { user, signOut } = useAuth();
  const [activeView, setActiveView] = useState<AgentView>('overview');
  const [assignedOperations, setAssignedOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [agencyLabel, setAgencyLabel] = useState<string>('');
  const [pendingReportsBadge, setPendingReportsBadge] = useState<number>(0);

  const loadOperations = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (user.agencyId) {
        const ag = await getAgency(user.agencyId);
        if (ag?.name) setAgencyLabel(ag.name);
      }
      const allOps = await db.operations.toArray();
      const myOps = allOps.filter(
        (op) =>
          op.assignedAgentIds?.includes(user.uid) ||
          (user.agencyId && op.agencyId === user.agencyId)
      );
      myOps.sort((a, b) => b.createdAt - a.createdAt);
      setAssignedOperations(myOps);

      const allRep = await db.reports.toArray();
      const myAlerts = allRep.filter(
        (r) => r.createdBy === user.uid && (r.status === 'retourne' || r.status === 'brouillon')
      );
      setPendingReportsBadge(myAlerts.length);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperations();
  }, [user]);

  const handleMarkComplete = async (opId: string) => {
    setCompletingId(opId);
    try {
      await db.operations.update(opId, {
        status: 'termine',
        updatedAt: Date.now(),
        syncStatus: 'pending',
      });
      await db.syncQueue.add({
        entity: 'operation',
        entityId: opId,
        operation: 'update',
        attempts: 0,
        lastError: null,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await loadOperations();
      void triggerSyncNow();
    } catch {
      // ignore
    } finally {
      setCompletingId(null);
    }
  };

  const handleSelectView = (view: AgentView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSidebarNavigate = (item: string) => {
    if (item === 'reports') {
      handleSelectView('reports');
    } else if (item === 'billetage' || item === 'accounting') {
      handleSelectView('billetage');
    } else if (item === 'salaries') {
      handleSelectView('salary');
    } else if (item === 'transfers') {
      handleSelectView('transfers');
    } else if (item === 'debts') {
      handleSelectView('debts');
    } else if (item === 'chat') {
      handleSelectView('chat');
    } else if (item === 'dashboard' || item === 'transactions') {
      handleSelectView('overview');
    }
  };

  const sidebarActiveItem =
    activeView === 'overview'
      ? 'dashboard'
      : activeView === 'salary'
        ? 'salaries'
        : activeView;

  const pendingOpsCount = assignedOperations.filter((o) => o.status !== 'termine').length;

  return (
    <AppLayout
      title="Espace Agent — Ets AMANI"
      subtitle="Guichet, exécution des opérations & tenue de caisse locale"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => handleSelectView('chat')}
    >
      <div className="space-y-6">
        {/* Banner Agent */}
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <UserAvatar
                user={user}
                size="lg"
                showStatus
                isOnline={true}
                className="ring-2 ring-emerald-400/50 shadow-lg shrink-0"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="text-xl font-black tracking-tight sm:text-2xl lg:text-3xl truncate">
                    Guichet & Opérations
                  </h1>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30 shrink-0">
                    Poste Opérationnel
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-300 truncate">
                  Agent : <strong>{user?.displayName}</strong> ({user?.function || 'Guichetier'}) • Agence :{' '}
                  <span className="font-semibold">{agencyLabel || user?.agencyId || 'Centrale'}</span>
                </p>
              </div>
            </div>

            {/* Barre de navigation rapide du banner */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'reports' ? 'overview' : 'reports')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  activeView === 'reports'
                    ? 'bg-blue-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Mes Rapports</span>
                {pendingReportsBadge > 0 && (
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-slate-950">
                    {pendingReportsBadge}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'billetage' ? 'overview' : 'billetage')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  activeView === 'billetage'
                    ? 'bg-emerald-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                }`}
              >
                <Coins className="h-4 w-4" />
                <span>Billetage Caisse</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'salary' ? 'overview' : 'salary')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-sm ${
                  activeView === 'salary'
                    ? 'bg-amber-300 text-slate-950 ring-2 ring-white/50'
                    : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                }`}
              >
                <WalletCards className="h-4 w-4" />
                <span>Mon Salaire</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'transfers' ? 'overview' : 'transfers')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeView === 'transfers'
                    ? 'bg-white text-slate-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span>Transferts</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'debts' ? 'overview' : 'debts')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeView === 'debts'
                    ? 'bg-white text-slate-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Scale className="h-4 w-4" />
                <span>Dettes</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectView(activeView === 'chat' ? 'overview' : 'chat')}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeView === 'chat'
                    ? 'bg-white text-slate-950 shadow-md'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Chat</span>
              </button>

              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-xl bg-red-500/20 px-3.5 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-500/30"
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barre de navigation d'espace de travail avec onglets et fil d'Ariane */}
        <WorkspaceNavigationHeader
          workspaceTitle="Espace Agent Guichet"
          category={agencyLabel || 'Guichet Local'}
          activeModuleTitle={
            activeView === 'overview'
              ? 'Missions & Opérations'
              : activeView === 'reports'
                ? 'Mes Rapports d\'Activité'
                : activeView === 'billetage'
                  ? 'Billetage & Tenue de Caisse'
                  : activeView === 'salary'
                    ? 'Fiche de Rémunération'
                    : activeView === 'transfers'
                      ? 'Transferts Inter-Agences'
                      : activeView === 'debts'
                        ? 'Engagements & Dettes'
                        : 'Messagerie & Alertes'
          }
          activeModuleDescription={
            activeView === 'overview'
              ? 'Tâches opérationnelles, exécution de retraits/dépôts et missions locales'
              : activeView === 'reports'
                ? 'Formulaires adaptatifs guidés, déclaration d\'activités, brouillons sécurisés et transmission hiérarchique'
                : activeView === 'billetage'
                  ? 'Comptage physique des coupures USD et CDF et justification de caisse'
                  : activeView === 'salary'
                    ? 'Consultation de vos fiches de paie et historiques de salaires'
                    : activeView === 'transfers'
                      ? 'Envoi et réception des transferts inter-agences pour les clients'
                      : activeView === 'debts'
                        ? 'Gestion des créances et dettes de votre agence'
                        : 'Échanges en temps réel avec la Direction et les collègues'
          }
          backLabel="Missions & Guichet"
          onBack={() => handleSelectView('overview')}
          tabs={AGENT_TABS.map((tab) => ({
            ...tab,
            badge:
              tab.id === 'overview' && pendingOpsCount > 0
                ? pendingOpsCount
                : tab.id === 'reports' && pendingReportsBadge > 0
                  ? pendingReportsBadge
                  : undefined,
          }))}
          activeTabId={activeView}
          onTabChange={(id) => handleSelectView(id as AgentView)}
        />

        {/* CONTENU PRINCIPAL DU WORKSPACE : Immédiatement visible selon la vue sélectionnée */}
        {activeView === 'reports' && (
          <div className="relative animate-in fade-in duration-200">
            <ReportsModule
              onClose={() => handleSelectView('overview')}
              onOpenBilletage={() => handleSelectView('billetage')}
            />
          </div>
        )}

        {activeView === 'billetage' && (
          <div className="relative animate-in fade-in duration-200">
            <BilletageModule onClose={() => handleSelectView('overview')} />
          </div>
        )}

        {activeView === 'salary' && (
          <div className="relative animate-in fade-in duration-200">
            <SalaryModule mode="agent" onClose={() => handleSelectView('overview')} />
          </div>
        )}

        {activeView === 'transfers' && (
          <div className="relative animate-in fade-in duration-200">
            <TreasuryTransfersDebtsModule
              mode="transfers"
              onClose={() => handleSelectView('overview')}
            />
          </div>
        )}

        {activeView === 'debts' && (
          <div className="relative animate-in fade-in duration-200">
            <TreasuryTransfersDebtsModule
              mode="debts"
              onClose={() => handleSelectView('overview')}
            />
          </div>
        )}

        {activeView === 'chat' && (
          <div className="relative animate-in fade-in duration-200">
            <ChatModule onClose={() => handleSelectView('overview')} />
          </div>
        )}

        {/* Vue d'ensemble (Missions & Guichet) */}
        {activeView === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Actions Rapides Guichet */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Missions Affectées
                  </span>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {pendingOpsCount}
                  </p>
                  <p className="text-xs text-amber-600 font-semibold">À exécuter au guichet</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <Clock className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Opérations Terminées
                  </span>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {assignedOperations.filter((o) => o.status === 'termine').length}
                  </p>
                  <p className="text-xs text-emerald-600 font-semibold">Enregistrées avec succès</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Mode Hors-Ligne
                  </span>
                  <p className="mt-1 text-base font-bold text-slate-900">100% Fonctionnel</p>
                  <p className="text-xs text-slate-500">Dexie synchronise en continu</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Wifi className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Liste des Opérations & Missions affectées */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Mes Missions Opérationnelles</h2>
                  <p className="text-xs text-slate-500">
                    Tâches et approvisionnements assignés par la Direction ou l'Administrateur
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadOperations}
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Actualiser</span>
                </button>
              </div>

              {assignedOperations.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Briefcase className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                  <p className="font-semibold text-slate-700">Aucune mission en cours</p>
                  <p className="text-xs text-slate-500">Vous êtes à jour dans vos attributions de guichet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {assignedOperations.map((op) => (
                    <div
                      key={op.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{op.operationNumber}</span>
                          <span className="rounded-md bg-blue-50 px-2 py-0.5 font-bold uppercase text-blue-700">
                            {op.type}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${
                              op.status === 'termine'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {op.status === 'termine' ? 'Terminé' : 'En attente d\'exécution'}
                          </span>
                        </div>
                        <p className="font-bold text-sm text-slate-800">{op.title}</p>
                        <p className="text-slate-500">{op.description}</p>
                        {op.amount !== undefined && (
                          <p className="font-semibold text-emerald-700">
                            Montant : {op.amount.toLocaleString('fr-FR')} {op.currency}
                          </p>
                        )}
                      </div>
                      {op.status !== 'termine' && (
                        <button
                          type="button"
                          disabled={completingId === op.id}
                          onClick={() => handleMarkComplete(op.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 shrink-0 self-start sm:self-center"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <span>{completingId === op.id ? 'Clôture...' : 'Marquer comme effectuée'}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
