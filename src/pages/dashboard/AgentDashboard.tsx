import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Coins,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Scale,
  Search,
  Smartphone,
  WalletCards,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from '../../components/layout/AppLayout';
import UserAvatar from '../../components/common/UserAvatar';
import DashboardModuleCard from '../../components/dashboard/DashboardModuleCard';
import DashboardModuleGrid from '../../components/dashboard/DashboardModuleGrid';
import BilletageModule from './components/BilletageModule';
import ChatModule from './components/ChatModule';
import TreasuryTransfersDebtsModule from './components/TreasuryTransfersDebtsModule';
import SalaryModule from './components/SalaryModule';
import { db } from '../../lib/db';
import { getAgency } from '../../services/AgencyService';
import { triggerSyncNow } from '../../services/SyncWorker';
import type { Operation } from '../../types/operation';

export default function AgentDashboard() {
  const { user, signOut } = useAuth();
  const [showBilletage, setShowBilletage] = useState(false);
  const [activeSubModule, setActiveSubModule] = useState<
    'chat' | 'transfers' | 'debts' | 'salary' | null
  >(null);
  const [assignedOperations, setAssignedOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [agencyLabel, setAgencyLabel] = useState<string>('');

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

  const handleSidebarNavigate = (item: string) => {
    if (item === 'billetage' || item === 'accounting') {
      setShowBilletage(true);
      setActiveSubModule(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'salaries') {
      setShowBilletage(false);
      setActiveSubModule('salary');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'transfers') {
      setShowBilletage(false);
      setActiveSubModule('transfers');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'debts') {
      setShowBilletage(false);
      setActiveSubModule('debts');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'chat') {
      setShowBilletage(false);
      setActiveSubModule('chat');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item === 'dashboard' || item === 'transactions') {
      setShowBilletage(false);
      setActiveSubModule(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const sidebarActiveItem = showBilletage
    ? 'billetage'
    : activeSubModule === 'salary'
      ? 'salaries'
      : activeSubModule || 'dashboard';

  return (
    <AppLayout
      title="Espace Agent — Ets AMANI"
      subtitle="Guichet, exécution des opérations & tenue de caisse locale"
      activeItem={sidebarActiveItem}
      onNavigate={handleSidebarNavigate}
      onNavigateToChat={() => {
        setActiveSubModule('chat');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <div className="space-y-6">
        {/* Banner Agent */}
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <UserAvatar
                user={user}
                size="lg"
                showStatus
                isOnline={true}
                className="ring-2 ring-emerald-400/50 shadow-lg"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h1 className="text-xl font-black tracking-tight sm:text-3xl">
                    Guichet & Opérations
                  </h1>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                    Poste Opérationnel
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  Agent : <strong>{user?.displayName}</strong> ({user?.function || 'Guichetier'}) • Agence :{' '}
                  <span className="font-semibold">{agencyLabel || user?.agencyId || 'Centrale'}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveSubModule(null);
                  setShowBilletage((v) => !v);
                }}
                className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md hover:bg-emerald-300"
              >
                <Coins className="h-4 w-4" />
                {showBilletage ? 'Masquer Billetage' : 'Billetage Caisse'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBilletage(false);
                  setActiveSubModule((cur) => (cur === 'salary' ? null : 'salary'));
                }}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md hover:bg-amber-300"
              >
                <WalletCards className="h-4 w-4" />
                Mon Salaire
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBilletage(false);
                  setActiveSubModule((cur) => (cur === 'transfers' ? null : 'transfers'));
                }}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Transferts Inter-Agences
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBilletage(false);
                  setActiveSubModule((cur) => (cur === 'debts' ? null : 'debts'));
                }}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20"
              >
                <Scale className="h-4 w-4" />
                Suivi des Dettes
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBilletage(false);
                  setActiveSubModule((cur) => (cur === 'chat' ? null : 'chat'));
                }}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/20"
              >
                Chat & Annonces
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/30"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>

        {/* Billetage Toggle */}
        {showBilletage && (
          <div className="relative">
            <BilletageModule onClose={() => setShowBilletage(false)} />
          </div>
        )}

        {activeSubModule === 'salary' && (
          <div className="relative">
            <SalaryModule mode="agent" onClose={() => setActiveSubModule(null)} />
          </div>
        )}

        {activeSubModule === 'chat' && (
          <div className="relative">
            <ChatModule onClose={() => setActiveSubModule(null)} />
          </div>
        )}

        {activeSubModule === 'transfers' && (
          <div className="relative">
            <TreasuryTransfersDebtsModule
              mode="transfers"
              onClose={() => setActiveSubModule(null)}
            />
          </div>
        )}

        {activeSubModule === 'debts' && (
          <div className="relative">
            <TreasuryTransfersDebtsModule
              mode="debts"
              onClose={() => setActiveSubModule(null)}
            />
          </div>
        )}

        {/* Actions Rapides Guichet */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Missions Affectées
              </span>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {assignedOperations.filter((o) => o.status !== 'termine').length}
              </p>
              <p className="text-xs text-amber-600 font-semibold">À exécuter au guichet</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
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

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
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
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Mes Missions Opérationnelles</h2>
              <p className="text-xs text-slate-500">
                Tâches et approvisionnements assignés par la Direction ou l'Administrateur
              </p>
            </div>
            <button
              type="button"
              onClick={loadOperations}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
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
                <div key={op.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{op.operationNumber}</span>
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-bold uppercase text-blue-700">
                        {op.type}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${
                        op.status === 'termine' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {op.status === 'termine' ? 'Terminé' : 'En attente d exécution'}
                      </span>
                    </div>
                    <p className="mt-1 font-bold text-sm text-slate-800">{op.title}</p>
                    <p className="text-slate-500 mt-0.5">{op.description}</p>
                    {op.amount !== undefined && (
                      <p className="mt-1 font-semibold text-emerald-700">
                        Montant : {op.amount.toLocaleString()} {op.currency}
                      </p>
                    )}
                  </div>
                  {op.status !== 'termine' && (
                    <button
                      type="button"
                      disabled={completingId === op.id}
                      onClick={() => handleMarkComplete(op.id)}
                      className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800 disabled:opacity-50 shrink-0"
                    >
                      {completingId === op.id ? 'Clôture...' : 'Marquer comme effectuée'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
